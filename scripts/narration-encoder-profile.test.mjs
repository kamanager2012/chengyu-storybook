import assert from "node:assert/strict";
import test from "node:test";
import {
  NARRATION_ENCODER_PROFILE_ID,
  NARRATION_ENCODER_PROFILE_PATH,
  readNarrationEncoderProfile,
  validateLocalNarrationEncoder,
  validateNarrationEncoderProfile,
} from "./narration-encoder-profile.mjs";

const EXPECTED_FFMPEG_SHA = "e8a8d46f5225f3062cec7c07fb145d58ae73c603cb740dcd5bad34bfb54e455a";
const EXPECTED_LAME_SHA = "98d0d7579c760053242a1deac2ebe335b8f8636f44235580f05b732f5fa207bb";

function approvedSnapshot() {
  return {
    schemaVersion: 1,
    architecture: "amd64",
    binaries: [
      { name: "ffmpeg", path: "/usr/bin/ffmpeg", package: "ffmpeg", packageVersion: "7:7.1.5-0+deb13u1", sha256: EXPECTED_FFMPEG_SHA, versionLine: "ffmpeg version 7.1.5-0+deb13u1 Copyright (c) 2000-2026 the FFmpeg developers" },
      { name: "ffprobe", path: "/usr/bin/ffprobe", package: "ffmpeg", packageVersion: "7:7.1.5-0+deb13u1", sha256: "cefc5f81c0b18429cdbf8fa5a89e1e9c759235e10f93f9b329ff1b2fdff26f46", versionLine: "ffprobe version 7.1.5-0+deb13u1 Copyright (c) 2007-2026 the FFmpeg developers" },
    ],
    libraries: [
      { soname: "libavcodec.so.61", package: "libavcodec61", packageVersion: "7:7.1.5-0+deb13u1", sha256: "c01e80460c07b27883a61c53e549755b9ff052071a83f4912ff285168719219d" },
      { soname: "libavformat.so.61", package: "libavformat61", packageVersion: "7:7.1.5-0+deb13u1", sha256: "8cde31eb30ee1ccc7d3758f60fe46dc9f342c4c9fef98cef81ecf7b681b78eeb" },
      { soname: "libavutil.so.59", package: "libavutil59", packageVersion: "7:7.1.5-0+deb13u1", sha256: "6c463f7e033438989533aea3c35e4c9a98fd6b0a637ddb8529733c0f3db1850a" },
      { soname: "libmp3lame.so.0", package: "libmp3lame0", packageVersion: "3.100-6+b3", sha256: EXPECTED_LAME_SHA },
      { soname: "libswresample.so.5", package: "libswresample5", packageVersion: "7:7.1.5-0+deb13u1", sha256: "de57f190891cf107b9c2fb51fc7d45c02c6c652f6fc7992a3c26d1f16f371674" },
    ],
    encoderInventoryLine: "A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3) (codec mp3)",
  };
}

export { approvedSnapshot };

test("approved narration encoder profile is exact and model-free-app scoped", () => {
  const binding = readNarrationEncoderProfile();
  const validation = validateNarrationEncoderProfile(binding.profile);
  assert.equal(validation.valid, true, validation.issues.join("; "));
  assert.equal(binding.profile.profileId, NARRATION_ENCODER_PROFILE_ID);
  assert.equal(binding.path, NARRATION_ENCODER_PROFILE_PATH);
  assert.equal(binding.profile.codec.name, "libmp3lame");
  assert.match(binding.profile.boundary, /browser application does not ship/);
});

test("encoder profile identity or binary/library drift fails closed", () => {
  const { profile } = readNarrationEncoderProfile();
  for (const mutate of [
    (value) => { value.status = "pending"; },
    (value) => { value.binaries[0].sha256 = "0".repeat(64); },
    (value) => { value.libraries.find((item) => item.soname === "libmp3lame.so.0").sha256 = "0".repeat(64); },
    (value) => { value.codec.bitrateKbps = 64; },
  ]) {
    const changed = structuredClone(profile);
    mutate(changed);
    assert.equal(validateNarrationEncoderProfile(changed).valid, false);
  }
});

test("local encoder snapshot must match every pinned binary and critical library", () => {
  const good = approvedSnapshot();
  assert.equal(validateLocalNarrationEncoder(good).valid, true);

  const ffmpegDrift = structuredClone(good);
  ffmpegDrift.binaries[0].sha256 = "0".repeat(64);
  assert.equal(validateLocalNarrationEncoder(ffmpegDrift).valid, false);

  const lameDrift = structuredClone(good);
  lameDrift.libraries.find((item) => item.soname === "libmp3lame.so.0").sha256 = "0".repeat(64);
  assert.equal(validateLocalNarrationEncoder(lameDrift).valid, false);
});
