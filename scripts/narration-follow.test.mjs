import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("illustrated reader adds live-page motion, karaoke, and picture sfx without restoring legacy controls", () => {
  const reader = read("src/components/illustrated-story-reader.tsx") + read("src/components/narration-follow-text.tsx");
  const follow = read("src/lib/narration-follow.ts");
  const sfx = read("src/lib/page-sfx.ts");
  const css = read("src/styles.css");

  assert.match(follow, /export const LEAD_RATIO = 0\.06/);
  assert.match(follow, /export const TAIL_RATIO = 0\.04/);
  assert.match(follow, /export function tokenizeFollowText/);
  assert.match(follow, /export function spokenProgress/);
  assert.match(follow, /export function activeSpokenIndex/);
  assert.match(follow, /export function seekTimeForIndex/);
  assert.match(sfx, /export function playPictureSfx/);
  assert.match(sfx, /export function playTurnSfx/);
  assert.match(sfx, /AudioContext/);
  assert.match(reader, /data-narration-follow/);
  assert.match(reader, /data-picture-hotspot/);
  assert.match(reader, /data-page-motion/);
  assert.match(reader, /data-page-sfx/);
  assert.match(reader, /pointer-events-none/);
  assert.doesNotMatch(reader, /自动翻页/);
  assert.doesNotMatch(reader, /背景音乐/);
  assert.doesNotMatch(reader, /开始听故事/);
  assert.doesNotMatch(reader, /听讲解/);
  assert.doesNotMatch(reader, /chengyu-progress-v1/);
  assert.doesNotMatch(reader, /chengyu-settings-v1/);
  assert.match(css, /@keyframes kenburns-in/);
  assert.match(css, /@keyframes kenburns-left/);
  assert.match(css, /@keyframes kenburns-right/);
  assert.match(css, /@keyframes kenburns-up/);
  assert.match(css, /\[data-follow-token\]\[data-active="true"\]/);
  assert.match(css, /\.picture-spark/);
});

let follow;
try {
  follow = await import("../src/lib/narration-follow.ts");
} catch {
  follow = null;
}

test("tokenizeFollowText groups punctuation onto the previous glyph", { skip: !follow }, () => {
  assert.deepEqual(follow.tokenizeFollowText("田野边。"), [
    { text: "田", weight: 1, spoken: true },
    { text: "野", weight: 1, spoken: true },
    { text: "边。", weight: 1, spoken: true },
  ]);
  assert.deepEqual(follow.tokenizeFollowText("《守株待兔》"), [
    { text: "《", weight: 0, spoken: false },
    { text: "守", weight: 1, spoken: true },
    { text: "株", weight: 1, spoken: true },
    { text: "待", weight: 1, spoken: true },
    { text: "兔》", weight: 1, spoken: true },
  ]);
});

test("spokenProgress skips lead-in silence and clamps to the spoken span", { skip: !follow }, () => {
  assert.equal(follow.spokenProgress(0, 0), 0);
  assert.equal(follow.spokenProgress(0.3, 10), 0);
  assert.equal(follow.spokenProgress(0.6, 10), 0);
  assert.ok(follow.spokenProgress(1.5, 10) > 0);
  assert.equal(follow.spokenProgress(10, 10), 1);
  assert.equal(follow.spokenProgress(9.7, 10), 1);
});

test("activeSpokenIndex and seekTimeForIndex stay inside the spoken tokens", { skip: !follow }, () => {
  const tokens = follow.tokenizeFollowText("一二三。");
  assert.equal(follow.activeSpokenIndex(tokens, 0), 0);
  assert.equal(follow.activeSpokenIndex(tokens, 0.5), 1);
  assert.equal(follow.activeSpokenIndex(tokens, 1), 2);
  assert.equal(follow.activeSpokenIndex([], 0.5), -1);
  const start = follow.seekTimeForIndex(tokens, 0, 10);
  const middle = follow.seekTimeForIndex(tokens, 1, 10);
  const end = follow.seekTimeForIndex(tokens, 2, 10);
  assert.ok(start > 0.5 && start < middle);
  assert.ok(middle < end && end < 9.7);
});
