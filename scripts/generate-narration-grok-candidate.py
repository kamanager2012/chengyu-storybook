#!/usr/bin/env python3
"""Listen-only Grok / xAI TTS for one story. Does not update narration-state or Kokoro approvals."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TTS_URL = "https://api.x.ai/v1/tts"
VOICES_URL = "https://api.x.ai/v1/tts/voices"
OAUTH_TOKEN_URL = "https://auth.x.ai/oauth2/token"
AUTH_PATH = Path.home() / ".grok" / "auth.json"
WORK_ROOT = REPO / ".narration-work"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def http_json(url: str, *, method: str = "GET", headers: dict | None = None, data: bytes | None = None, timeout: int = 60):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            ctype = resp.headers.get("content-type", "")
            return resp.status, ctype, body
    except urllib.error.HTTPError as exc:
        err = exc.read()
        raise RuntimeError(f"{method} {url} failed ({exc.code}): {err[:400]!r}") from exc


def refresh_oauth() -> tuple[str, str]:
    if not AUTH_PATH.is_file():
        raise RuntimeError(f"missing {AUTH_PATH}")
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
    status, _, body = http_json(
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
    return access, "grok-oauth-refresh"


def resolve_token() -> tuple[str, str]:
    env_key = os.environ.get("XAI_API_KEY")
    if env_key:
        return env_key, "XAI_API_KEY"
    return refresh_oauth()


def load_generation_set(story: str) -> dict:
    # Reuse the Node generation-set so text hashes stay canonical.
    import subprocess

    helper = r"""
import { buildNarrationGenerationSet } from './scripts/narration-generation-set.mjs';
import { validateApprovedGenerationSet } from './scripts/kokoro-generation-contract.mjs';
const story = process.env.STORY_ID;
const set = buildNarrationGenerationSet({ story });
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
        env={**os.environ, "STORY_ID": story},
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "failed to build generation set")
    return json.loads(result.stdout)


def synthesize(token: str, text: str, voice_id: str, language: str) -> bytes:
    payload = json.dumps({"text": text, "voice_id": voice_id, "language": language}).encode()
    status, ctype, body = http_json(
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
    if status != 200 or not body.startswith(b"\xff"):
        raise RuntimeError(f"unexpected TTS response status={status} ctype={ctype} bytes={len(body)}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--story", required=True)
    parser.add_argument("--voice", default="ara")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-overlay", action="store_true")
    parser.add_argument(
        "--install-dir",
        help="Optional directory (repo-relative or absolute) to install page mp3s as <pageId>.mp3",
    )
    args = parser.parse_args()

    generation = load_generation_set(args.story)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    work_dir = WORK_ROOT / f"candidate-grok-tts-{args.voice}-{args.story}-{stamp}"
    summary = {
        "schemaVersion": 1,
        "mode": "dry-run" if args.dry_run else "candidate-listen",
        "warning": "Listen-only Grok cloud TTS. Does not promote provider, write receipts, or update narration-state.",
        "story": args.story,
        "provider": "xai-grok-tts",
        "voiceId": args.voice,
        "language": args.language,
        "inputItemCount": generation["count"],
        "inputDigestSha256": generation["inputDigestSha256"],
        "workDir": str(work_dir.relative_to(REPO)).replace("\\", "/"),
        "overlayPublicAudio": not args.no_overlay,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.dry_run:
        return 0

    token, auth_source = resolve_token()
    status, _, voices_body = http_json(VOICES_URL, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    voices = json.loads(voices_body).get("voices") or []
    if not any(v.get("voice_id") == args.voice for v in voices):
        raise RuntimeError(f"voice {args.voice!r} not in TTS catalog")

    work_dir.mkdir(parents=True, exist_ok=False)
    mp3_root = work_dir / "mp3"
    backup_root = work_dir / "backup-public"
    outputs = []

    for entry in generation["entries"]:
        audio = synthesize(token, entry["text"], args.voice, args.language)
        staged = mp3_root / f"{entry['key']}.mp3"
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(audio)
        outputs.append(
            {
                "key": entry["key"],
                "file": entry["file"],
                "textSha256": entry["textSha256"],
                "stagedPath": str(staged),
                "bytes": len(audio),
                "audioSha256": sha256_bytes(audio),
            }
        )
        print(f"synthesized {entry['key']} ({len(audio)} bytes)", file=sys.stderr)

    overlay = []
    if not args.no_overlay:
        for output in outputs:
            public_path = REPO / output["file"]
            if not public_path.is_file():
                raise RuntimeError(f"public audio missing: {output['file']}")
            backup_path = backup_root / output["file"]
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(public_path, backup_path)
            tmp = public_path.with_suffix(public_path.suffix + ".candidate-tmp")
            shutil.copy2(output["stagedPath"], tmp)
            tmp.replace(public_path)
            overlay.append(
                {
                    "file": output["file"],
                    "audioSha256": output["audioSha256"],
                    "bytes": output["bytes"],
                    "backup": str(backup_path.relative_to(REPO)).replace("\\", "/"),
                }
            )

    installed = []
    if args.install_dir:
        install_root = Path(args.install_dir)
        if not install_root.is_absolute():
            install_root = REPO / install_root
        install_root.mkdir(parents=True, exist_ok=True)
        for output in outputs:
            page_name = Path(output["file"]).name
            target = install_root / page_name
            shutil.copy2(output["stagedPath"], target)
            installed.append(
                {
                    "file": str(target.relative_to(REPO)).replace("\\", "/"),
                    "audioSha256": output["audioSha256"],
                    "bytes": output["bytes"],
                }
            )

    report = {
        "schemaVersion": 1,
        "mode": "candidate-listen",
        "durableReceipt": False,
        "narrationStateUpdated": False,
        "approvedKokoroUnchanged": True,
        "authSource": auth_source,
        "story": args.story,
        "provider": "xai-grok-tts",
        "voiceId": args.voice,
        "language": args.language,
        "endpoint": TTS_URL,
        "inputItemCount": generation["count"],
        "inputDigestSha256": generation["inputDigestSha256"],
        "workDir": str(work_dir.relative_to(REPO)).replace("\\", "/"),
        "listen": {
            "storyPath": f"/story/{args.story}",
            "note": "Hard-refresh the local reader. Overlays public/audio only." if not args.no_overlay else "Installed under --install-dir; default /audio unchanged.",
            "restoreHint": f"cp -a {backup_root.relative_to(REPO)}/public/audio/{args.story}/. public/audio/{args.story}/",
        },
        "outputs": outputs,
        "overlay": overlay,
        "installed": installed,
    }
    (work_dir / "listen-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
