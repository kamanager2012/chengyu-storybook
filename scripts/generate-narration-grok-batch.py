#!/usr/bin/env python3
"""Batch-replace public/audio with Grok TTS for the full approved narration set.

Listen/product cutover helper only: does not write Kokoro receipts or narration-state.
Supports resume via a JSON checkpoint under .narration-work/.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TTS_URL = "https://api.x.ai/v1/tts"
OAUTH_TOKEN_URL = "https://auth.x.ai/oauth2/token"
AUTH_PATH = Path.home() / ".grok" / "auth.json"
WORK_ROOT = REPO / ".narration-work"

_token_lock = threading.Lock()
_token_cache: dict[str, str] = {"token": "", "source": ""}


class TtsHttpError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def http_bytes(url: str, *, method: str = "GET", headers: dict | None = None, data: bytes | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise TtsHttpError(f"{method} {url} failed ({exc.code}): {err[:400]!r}", status=exc.code) from exc


def refresh_oauth() -> str:
    auth = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    key = next(iter(auth))
    entry = auth[key]
    form = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": entry["refresh_token"],
            "client_id": entry["oidc_client_id"],
        }
    ).encode()
    body = http_bytes(
        OAUTH_TOKEN_URL,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=form,
        timeout=30,
    )
    payload = json.loads(body)
    access = payload["access_token"]
    if payload.get("refresh_token"):
        entry["refresh_token"] = payload["refresh_token"]
    entry["key"] = access
    expires_in = int(payload.get("expires_in") or 3600)
    entry["expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat().replace("+00:00", "Z")
    auth[key] = entry
    AUTH_PATH.write_text(json.dumps(auth, indent=2) + "\n", encoding="utf-8")
    return access


def resolve_token(force: bool = False) -> str:
    with _token_lock:
        if not force and _token_cache["token"]:
            return _token_cache["token"]
        env_key = os.environ.get("XAI_API_KEY")
        if env_key:
            _token_cache["token"] = env_key
            _token_cache["source"] = "XAI_API_KEY"
            return env_key
        token = refresh_oauth()
        _token_cache["token"] = token
        _token_cache["source"] = "grok-oauth-refresh"
        return token


def load_full_generation_set() -> dict:
    helper = r"""
import { buildNarrationGenerationSet } from './scripts/narration-generation-set.mjs';
import { validateApprovedGenerationSet } from './scripts/kokoro-generation-contract.mjs';
const set = buildNarrationGenerationSet({});
const v = validateApprovedGenerationSet(set);
if (!v.valid) { console.error(v.problems.join('\n')); process.exit(1); }
console.log(JSON.stringify(set));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", helper],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "failed to build full generation set")
    return json.loads(result.stdout)


def synthesize(text: str, voice_id: str, language: str) -> bytes:
    payload = json.dumps({"text": text, "voice_id": voice_id, "language": language}).encode()
    last_error: Exception | None = None
    for attempt in range(6):
        token = resolve_token(force=attempt > 0)
        try:
            body = http_bytes(
                TTS_URL,
                method="POST",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                data=payload,
                timeout=120,
            )
            if not body.startswith(b"\xff"):
                raise RuntimeError(f"unexpected audio magic {body[:4]!r}")
            return body
        except TtsHttpError as exc:
            last_error = exc
            if exc.status == 429:
                time.sleep(min(90, 5 * (2 ** attempt)))
                continue
            if exc.status in {401, 403} and attempt < 5:
                time.sleep(1.5)
                continue
            if attempt == 5:
                raise
            time.sleep(1.5 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == 5:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise last_error or RuntimeError("unreachable")


def load_entries_file(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(entries, list) or len(entries) == 0:
        raise RuntimeError("entries-file must contain a non-empty entries array")
    for entry in entries:
        if not isinstance(entry, dict) or not entry.get("key") or not entry.get("text") or not entry.get("file"):
            raise RuntimeError("each entries-file item requires key, text, and file")
    return entries


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="eve")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Optional cap for smoke runs")
    parser.add_argument("--entries-file", help="JSON object with entries[] or a raw entries array")
    parser.add_argument("--stage-dir", help="Write staged MP3s here as <key>.mp3")
    parser.add_argument("--no-public-write", action="store_true", help="Do not replace public/audio")
    parser.add_argument("--no-voice-mirror", action="store_true", help="Do not mirror into public/audio-voices")
    args = parser.parse_args()

    if args.no_public_write and not args.stage_dir:
        raise RuntimeError("--no-public-write requires --stage-dir so audio is not discarded")

    if args.entries_file:
        entries = load_entries_file(Path(args.entries_file))
        generation = {
            "count": len(entries),
            "inputDigestSha256": None,
        }
        scoped = True
    else:
        generation = load_full_generation_set()
        entries = list(generation["entries"])
        scoped = False
    if args.limit > 0:
        entries = entries[: args.limit]

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    work_dir = WORK_ROOT / f"batch-grok-tts-{args.voice}-{stamp}"
    checkpoint_path = WORK_ROOT / f"batch-grok-tts-{args.voice}.checkpoint.json"
    if scoped:
        checkpoint_path = WORK_ROOT / f"batch-grok-tts-{args.voice}-scoped.checkpoint.json"
    done: set[str] = set()
    if not scoped and checkpoint_path.is_file():
        prev = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if prev.get("voiceId") == args.voice and prev.get("inputDigestSha256") == generation["inputDigestSha256"]:
            done = set(prev.get("completedKeys") or [])
            print(f"resuming with {len(done)} completed keys", file=sys.stderr)

    summary = {
        "schemaVersion": 1,
        "mode": "dry-run" if args.dry_run else ("stage-only" if args.no_public_write else "batch-replace"),
        "warning": "Replaces public/audio MP3s with Grok cloud TTS. Does not update Kokoro receipts or narration-state."
        if not args.no_public_write
        else "Stage-only Eve TTS. Does not replace public/audio or update narration-state.",
        "voiceId": args.voice,
        "language": args.language,
        "inputItemCount": len(entries),
        "fullSetCount": generation.get("count"),
        "inputDigestSha256": generation.get("inputDigestSha256"),
        "alreadyDone": len(done),
        "remaining": len([e for e in entries if e["key"] not in done]),
        "concurrency": args.concurrency,
        "publicWrite": not args.no_public_write,
        "voiceMirror": not args.no_voice_mirror,
        "stageDir": args.stage_dir,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.dry_run:
        return 0

    work_dir.mkdir(parents=True, exist_ok=True)
    stage_dir = Path(args.stage_dir) if args.stage_dir else None
    if stage_dir is not None and not stage_dir.is_absolute():
        stage_dir = REPO / stage_dir
    if stage_dir is not None:
        stage_dir.mkdir(parents=True, exist_ok=True)
    resolve_token()
    lock = threading.Lock()
    completed = sorted(done)
    failures: list[dict] = []
    staged_outputs: list[dict] = []

    def write_checkpoint() -> None:
        if scoped:
            return
        payload = {
            "voiceId": args.voice,
            "language": args.language,
            "inputDigestSha256": generation["inputDigestSha256"],
            "completedKeys": completed,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "failureCount": len(failures),
        }
        checkpoint_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def process(entry: dict) -> None:
        key = entry["key"]
        if key in done:
            return
        audio = synthesize(entry["text"], args.voice, args.language)
        audio_sha = hashlib.sha256(audio).hexdigest()
        staged_rel = None
        if stage_dir is not None:
            staged_path = stage_dir / f"{key}.mp3"
            staged_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_staged = staged_path.with_suffix(staged_path.suffix + ".batch-tmp")
            tmp_staged.write_bytes(audio)
            tmp_staged.replace(staged_path)
            staged_rel = str(staged_path).replace("\\", "/")
        if not args.no_public_write:
            target = REPO / entry["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(target.suffix + ".batch-tmp")
            tmp.write_bytes(audio)
            tmp.replace(target)
            if not args.no_voice_mirror:
                voice_dir = REPO / "public" / "audio-voices" / entry["key"].split("/")[0] / args.voice
                voice_dir.mkdir(parents=True, exist_ok=True)
                page = Path(entry["file"]).name
                (voice_dir / page).write_bytes(audio)
        with lock:
            completed.append(key)
            done.add(key)
            staged_outputs.append(
                {
                    "key": key,
                    "file": entry["file"],
                    "textSha256": entry.get("textSha256"),
                    "bytes": len(audio),
                    "audioSha256": audio_sha,
                    "stagedPath": staged_rel,
                }
            )
            if len(completed) % 10 == 0 or len(completed) == len(entries):
                write_checkpoint()
                print(f"progress {len(completed)}/{len(entries)} last={key} bytes={len(audio)}", file=sys.stderr)

    pending = [e for e in entries if e["key"] not in done]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = {pool.submit(process, entry): entry["key"] for entry in pending}
        for fut in concurrent.futures.as_completed(futures):
            key = futures[fut]
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                with lock:
                    failures.append({"key": key, "error": str(exc)})
                    write_checkpoint()
                print(f"FAIL {key}: {exc}", file=sys.stderr)

    write_checkpoint()
    report = {
        "schemaVersion": 1,
        "mode": "stage-only" if args.no_public_write else "batch-replace",
        "voiceId": args.voice,
        "language": args.language,
        "authSource": _token_cache["source"],
        "inputItemCount": len(entries),
        "completed": len(completed),
        "failures": failures,
        "outputs": sorted(staged_outputs, key=lambda item: item["key"]),
        "checkpoint": None if scoped else str(checkpoint_path.relative_to(REPO)).replace("\\", "/"),
        "workDir": str(work_dir.relative_to(REPO)).replace("\\", "/"),
        "stageDir": None if stage_dir is None else str(stage_dir).replace("\\", "/"),
        "publicWrite": not args.no_public_write,
        "narrationStateUpdated": False,
        "kokoroReceiptsUpdated": False,
    }
    report_dir = stage_dir if stage_dir is not None else work_dir
    (report_dir / "batch-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
