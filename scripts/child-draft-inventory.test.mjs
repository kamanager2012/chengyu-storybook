import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EXPECTED_CHILD_OVERLAY_IDS } from "./child-overlay.mjs";
import { loadStoryEditions } from "./story-editions.mjs";
import { loadStoryModel } from "./story-model.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const draftsRoot = join(root, "content/imagine-child-drafts");
const PAGE_FILES = ["cover.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg", "p5.jpg", "p6.jpg", "p7.jpg"];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function assertCompleteSet(id, hallById) {
  const folder = join(draftsRoot, id);
  const logPath = join(draftsRoot, "logs", `${id}.json`);
  assert.equal(existsSync(folder), true, `${id}: draft folder missing`);
  assert.equal(existsSync(logPath), true, `${id}: complete-8 log missing`);
  const log = JSON.parse(readFileSync(logPath, "utf8"));
  assert.equal(log.storyId, id);
  assert.equal(log.status, "complete-8");
  assert.equal(log.edition, "child");
  assert.ok(Array.isArray(log.files) && log.files.length === 8, `${id}: log must list eight files`);
  const listed = log.files.map((file) => file.name).sort();
  assert.deepEqual(listed, [...PAGE_FILES].sort(), `${id}: log files must be cover plus p1–p7`);
  for (const file of log.files) {
    const path = join(folder, file.name);
    assert.equal(existsSync(path), true, `${id}: missing ${file.name}`);
    const buf = readFileSync(path);
    assert.equal(isJpeg(buf), true, `${id}/${file.name} must be a JPEG`);
    assert.equal(buf.byteLength, file.bytes, `${id}/${file.name} log bytes must match disk`);
    assert.equal(sha256(buf), file.sha256, `${id}/${file.name} log sha256 must match disk`);
  }
  assert.equal(hallById.get(id), "classic", `${id}: child draft must belong to the live 古风馆 id`);
}

test("child-draft complete-8 inventory matches on-disk JPEGs for required classic-hall titles", (t) => {
  const logDir = join(draftsRoot, "logs");
  if (!existsSync(logDir)) {
    t.skip("content/imagine-child-drafts/logs is gitignored; generate local complete-8 logs before asserting inventory");
    return;
  }
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  const editions = loadStoryEditions({ publishedIds });
  for (const id of EXPECTED_CHILD_OVERLAY_IDS) {
    assertCompleteSet(id, editions.hallById);
  }
});

test("child-draft logs never mark a partial folder complete-8", (t) => {
  const logDir = join(draftsRoot, "logs");
  if (!existsSync(logDir)) {
    t.skip("content/imagine-child-drafts/logs is gitignored; nothing to audit without local logs");
    return;
  }
  for (const name of readdirSync(logDir).filter((file) => file.endsWith(".json"))) {
    const log = JSON.parse(readFileSync(join(logDir, name), "utf8"));
    if (log.status !== "complete-8") continue;
    assertCompleteSet(log.storyId, loadStoryEditions({ publishedIds: loadStoryModel().stories.map((story) => story.id) }).hallById);
  }
});
