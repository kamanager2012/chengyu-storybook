import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkProductArtwork, generatedProductArtwork } from "./generate-product-artwork.mjs";
import { buildReleaseReadiness, readReleaseAssets } from "./release-readiness.mjs";
import { buildSourceLineage } from "./source-lineage.mjs";
import { repoRoot } from "./story-model.mjs";

const expectedHashes = new Map([
  ["public/favicon.svg", "c65508575651c8b6f1c10a9a2d252ae3ca81d35a2f4cdad0b96a4b7c90f2db88"],
  ["public/icon-180.svg", "fb60054d2c983046533b58d3567b85f6ce037942165c859b1286c9fc852f196f"],
  ["public/og.svg", "14b665893ee808757e8424c43f06e80417a8916e1fad26da33fa41dae41c71f3"],
  ["public/ui/bookshelf-paper.svg", "3e9a63d953f1694b74f87027073a90742fa51dfc8e6eee42a0629c65e4145836"],
  ["public/apple-touch-icon-180.png", "012cd97decdd21ccae133f57633f4c867409fee62f36a7a3db1960e2caec4ae6"],
  ["public/icon-192.png", "5a5479e56dbf5898758573251719e0bb2f0b5f983809e8f734b5b15b5db64cc6"],
  ["public/icon-512.png", "d67acffca9058a2cc216e1ffe9477be541dd6e714c284a4dffac297de61a07fa"],
  ["public/icon-maskable-512.png", "65dcf1dd067d88e0f573c12c5902afd9db2556d2ca040600a3822c05495cc78f"],
]);

const pngDimensions = new Map([
  ["public/apple-touch-icon-180.png", [180, 180]],
  ["public/icon-192.png", [192, 192]],
  ["public/icon-512.png", [512, 512]],
  ["public/icon-maskable-512.png", [512, 512]],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readPngDimensions(path) {
  const bytes = readFileSync(join(repoRoot, path));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path}: invalid PNG signature`);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR", `${path}: missing PNG IHDR`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("product artwork is deterministic and byte-current", () => {
  const generated = generatedProductArtwork();
  assert.equal(generated.length, expectedHashes.size);
  assert.deepEqual(checkProductArtwork(), []);
  for (const item of generated) assert.equal(item.sha256, expectedHashes.get(item.path));
  for (const [path, dimensions] of pngDimensions) assert.deepEqual(readPngDimensions(path), dimensions);
});

test("release artwork manifest contains only current owned outputs", () => {
  const manifest = readReleaseAssets();
  assert.deepEqual(manifest.productArtwork, [...expectedHashes.keys()]);
  for (const path of manifest.retiredProductArtwork) {
    assert.equal(existsSync(join(repoRoot, path)), false, `${path} must not ship after retirement`);
  }
});

test("owned artwork evidence binds generator and all exact outputs", () => {
  const evidence = JSON.parse(readFileSync(join(repoRoot, "content/evidence/artwork/project-owned-artwork.json"), "utf8"));
  const generatorBytes = readFileSync(join(repoRoot, evidence.generator.path));
  assert.equal(evidence.claim, "owned");
  assert.equal(evidence.method, "deterministic-repository-generator");
  assert.equal(evidence.generator.sha256, sha256(generatorBytes));
  assert.deepEqual(evidence.generator.externalInputs, []);
  assert.deepEqual(evidence.generator.dependencies, []);
  assert.equal(evidence.construction.thirdPartyImages, false);
  assert.equal(evidence.construction.thirdPartyFontsEmbedded, false);
  assert.equal(evidence.construction.networkFetches, false);
  assert.equal(evidence.construction.stockAssets, false);
  assert.deepEqual(
    new Map(evidence.outputs.map((item) => [item.path, item.sha256])),
    expectedHashes,
  );
});

test("all product artwork is rights-verified and source-known", () => {
  const release = buildReleaseReadiness();
  const artwork = release.assets.filter((asset) => asset.category === "product-artwork");
  assert.equal(artwork.length, expectedHashes.size);
  assert.ok(artwork.every((asset) => asset.provenanceStatus === "verified" && asset.claim === "owned"));

  const lineage = buildSourceLineage();
  const lineageArtwork = lineage.assets.filter((asset) => asset.category === "product-artwork");
  assert.equal(lineageArtwork.length, expectedHashes.size);
  assert.ok(lineageArtwork.every((asset) => asset.lineageStatus === "known"));
});
