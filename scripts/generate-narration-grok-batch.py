#!/usr/bin/env python3
"""Batch-replace public/audio with Grok TTS for the full approved narration set.

Listen/product cutover helper only: does not write Kokoro receipts or narration-state.
Supports resume via a JSON checkpoint under .narration-work/.
"""

from __future__ import annotations

import argparse
import concurrent.futures
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


def http_bytes(url: str, *, method: str = "GET", headers: dict | None = None, data: bytes | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} failed ({exc.code}): {err[:400]!r}") from exc


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
    for attempt in range(3):
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
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="eve")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Optional cap for smoke runs")
    args = parser.parse_args()

    generation = load_full_generation_set()
    entries = list(generation["entries"])
    if args.limit > 0:
        entries = entries[: args.limit]

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    work_dir = WORK_ROOT / f"batch-grok-tts-{args.voice}-{stamp}"
    checkpoint_path = WORK_ROOT / f"batch-grok-tts-{args.voice}.checkpoint.json"
    done: set[str] = set()
    if checkpoint_path.is_file():
        prev = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if prev.get("voiceId") == args.voice and prev.get("inputDigestSha256") == generation["inputDigestSha256"]:
            done = set(prev.get("completedKeys") or [])
            print(f"resuming with {len(done)} completed keys", file=sys.stderr)

    summary = {
        "schemaVersion": 1,
        "mode": "dry-run" if args.dry_run else "batch-replace",
        "warning": "Replaces public/audio MP3s with Grok cloud TTS. Does not update Kokoro receipts or narration-state.",
        "voiceId": args.voice,
        "language": args.language,
        "inputItemCount": len(entries),
        "fullSetCount": generation["count"],
        "inputDigestSha256": generation["inputDigestSha256"],
        "alreadyDone": len(done),
        "remaining": len([e for e in entries if e["key"] not in done]),
        "concurrency": args.concurrency,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.dry_run:
        return 0

    work_dir.mkdir(parents=True, exist_ok=True)
    resolve_token()
    lock = threading.Lock()
    completed = sorted(done)
    failures: list[dict] = []

    def write_checkpoint() -> None:
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
        target = REPO / entry["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".batch-tmp")
        tmp.write_bytes(audio)
        tmp.replace(target)
        # Mirror under audio-voices for optional picker paths.
        voice_dir = REPO / "public" / "audio-voices" / entry["key"].split("/")[0] / args.voice
        voice_dir.mkdir(parents=True, exist_ok=True)
        page = Path(entry["file"]).name
        (voice_dir / page).write_bytes(audio)
        with lock:
            completed.append(key)
            done.add(key)
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
        "mode": "batch-replace",
        "voiceId": args.voice,
        "language": args.language,
        "authSource": _token_cache["source"],
        "inputItemCount": len(entries),
        "completed": len(completed),
        "failures": failures,
        "checkpoint": str(checkpoint_path.relative_to(REPO)).replace("\\", "/"),
        "workDir": str(work_dir.relative_to(REPO)).replace("\\", "/"),
        "narrationStateUpdated": False,
        "kokoroReceiptsUpdated": False,
    }
    (work_dir / "batch-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
