#!/usr/bin/env python3
"""Synthesize pinned Kokoro Mandarin narration to staging WAV files.

The engine imports KModel and ZHG2P directly from clean, pinned source
checkouts via ``kokoro_runtime``. It never imports KPipeline, never downloads
model assets, never writes narration state, and never truncates over-limit
phoneme sequences.
"""

from __future__ import annotations

import argparse
import array
import contextlib
import json
import os
import platform as host_platform
from pathlib import Path
import sys
import wave

from kokoro_runtime import (
    assert_minimal_runtime_imports,
    load_pinned_runtime,
    phonemize_losslessly,
    validate_voice_pack,
    voice_reference_for_phonemes,
)

MODEL_REPOSITORY = "hexgrad/Kokoro-82M-v1.1-zh"
SAMPLE_RATE = 24000
DEFAULT_VOICE_FILE = "voices/zf_001.pt"
MODEL_FILE = "kokoro-v1_1-zh.pth"
CONFIG_FILE = "config.json"
ENGINE_ID = "kokoro-local-waveform-v2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--kokoro-src-dir", required=True)
    parser.add_argument("--misaki-src-dir", required=True)
    parser.add_argument("--voice-file", default=DEFAULT_VOICE_FILE)
    parser.add_argument("--device", choices=("cpu",), default="cpu")
    return parser.parse_args()


def normalized_arch() -> str:
    machine = host_platform.machine().lower()
    return "x64" if machine in {"x86_64", "amd64"} else machine


def safe_voice_relpath(value: str) -> str:
    normalized = value.replace("\\", "/").strip()
    if (
        not normalized
        or normalized.startswith("/")
        or ".." in normalized.split("/")
        or normalized.split("/")[0] != "voices"
        or not normalized.endswith(".pt")
    ):
        raise RuntimeError(f"voice file must be a voices/*.pt relative path; got {value!r}")
    return normalized


def speed_for_phonemes(phoneme_count: int, policy: dict | None) -> float:
    """Return Kokoro speed. Approved path uses 1.0; candidate storytelling is length-aware."""
    if not policy:
        return 1.0
    if policy.get("mode") != "length-aware":
        raise RuntimeError(f"unsupported storytelling speed mode: {policy.get('mode')!r}")
    short_ceil = policy["shortPhonemeCeiling"]
    long_floor = policy["longPhonemeFloor"]
    base = float(policy["base"])
    short = float(policy["short"])
    if not (0.5 <= base <= 1.2 and 0.5 <= short <= 1.2):
        raise RuntimeError("storytelling speed base/short must stay within 0.5..1.2")
    if not (1 <= short_ceil < long_floor <= 510):
        raise RuntimeError("storytelling phoneme bounds are invalid")
    if phoneme_count <= short_ceil:
        return short
    if phoneme_count >= long_floor:
        return base
    t = (phoneme_count - short_ceil) / (long_floor - short_ceil)
    return short + (base - short) * t


def write_pcm16_wav(path: Path, audio, torch_module) -> int:
    samples = (
        audio.detach()
        .to("cpu")
        .clamp(-1.0, 1.0)
        .mul(32767.0)
        .round()
        .to(dtype=torch_module.int16)
        .tolist()
    )
    pcm = array.array("h", samples)
    if sys.byteorder != "little":
        pcm.byteswap()

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    return len(samples)


def synthesize() -> dict:
    args = parse_args()
    assets_dir = Path(args.assets_dir).resolve()
    kokoro_src = Path(args.kokoro_src_dir).resolve()
    misaki_src = Path(args.misaki_src_dir).resolve()
    manifest_path = Path(args.manifest).resolve()
    voice_relpath = safe_voice_relpath(args.voice_file)

    import torch  # type: ignore

    runtime = load_pinned_runtime(kokoro_src, misaki_src)
    KModel = runtime["KModel"]
    ZHG2P = runtime["ZHG2P"]
    assert_minimal_runtime_imports()

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("manifest.entries must contain at least one narration item")
    speed_policy = manifest.get("speedPolicy")
    if speed_policy is not None and not isinstance(speed_policy, dict):
        raise RuntimeError("manifest.speedPolicy must be an object when present")

    config_path = assets_dir / CONFIG_FILE
    model_path = assets_dir / MODEL_FILE
    voice_path = assets_dir / voice_relpath
    for required in (config_path, model_path, voice_path):
        if not required.is_file():
            raise RuntimeError(f"required pinned asset is missing: {required}")

    torch.set_grad_enabled(False)
    torch.manual_seed(0)

    model = KModel(
        repo_id=MODEL_REPOSITORY,
        config=str(config_path),
        model=str(model_path),
    ).to(args.device).eval()
    voice_pack = torch.load(str(voice_path), map_location="cpu", weights_only=True)
    validate_voice_pack(voice_pack, torch)
    voice_pack = voice_pack.to(args.device)
    # Misaki prints an informational warning when English fallback is disabled.
    # Keep stdout machine-readable JSON by routing that message to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        g2p = ZHG2P(version="1.1", en_callable=None)
    assert_minimal_runtime_imports()

    completed = []
    silence = torch.zeros(int(SAMPLE_RATE * 0.12), dtype=torch.float32)
    applied_speeds = []

    for entry in entries:
        key = entry.get("key")
        text = entry.get("text")
        wav_path_value = entry.get("wavPath")
        if not isinstance(key, str) or not isinstance(text, str) or not text.strip() or not isinstance(wav_path_value, str):
            raise RuntimeError("each manifest entry requires key, non-empty text, and wavPath")

        wav_path = Path(wav_path_value).resolve()
        chunks = []
        phoneme_chunks = phonemize_losslessly(g2p, text)
        item_speeds = []
        for _graphemes, phonemes in phoneme_chunks:
            speed = speed_for_phonemes(len(phonemes), speed_policy)
            item_speeds.append(speed)
            applied_speeds.append(speed)
            ref_s = voice_reference_for_phonemes(voice_pack, phonemes)
            audio = model(phonemes, ref_s, speed=speed)
            if audio is not None and audio.numel() > 0:
                chunks.append(audio.detach().to("cpu").float())
        if not chunks:
            raise RuntimeError(f"{key}: Kokoro returned no audio")

        if len(chunks) == 1:
            audio = chunks[0]
        else:
            joined = []
            for index, chunk in enumerate(chunks):
                if index:
                    joined.append(silence)
                joined.append(chunk)
            audio = torch.cat(joined)

        sample_count = write_pcm16_wav(wav_path, audio, torch)
        completed.append(
            {
                "key": key,
                "wavPath": str(wav_path),
                "samples": sample_count,
                "durationSeconds": sample_count / SAMPLE_RATE,
                "phonemeChunks": len(phoneme_chunks),
                "maxPhonemeChunkLength": max(len(phonemes) for _, phonemes in phoneme_chunks),
                "speeds": item_speeds,
            }
        )

    assert_minimal_runtime_imports()
    return {
        "schemaVersion": 1,
        "engine": ENGINE_ID,
        "pythonVersion": sys.version.split()[0],
        "torchVersion": str(torch.__version__),
        "platform": sys.platform,
        "arch": normalized_arch(),
        "device": args.device,
        "sampleRateHz": SAMPLE_RATE,
        "voiceFile": voice_relpath,
        "speedPolicy": speed_policy,
        "appliedSpeedMin": min(applied_speeds) if applied_speeds else 1.0,
        "appliedSpeedMax": max(applied_speeds) if applied_speeds else 1.0,
        "g2p": "misaki.ZHG2P/1.1",
        "kokoroModulePath": runtime["kokoroModulePath"],
        "misakiModulePath": runtime["misakiModulePath"],
        "count": len(completed),
        "items": completed,
    }


def main() -> None:
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    report = synthesize()
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
