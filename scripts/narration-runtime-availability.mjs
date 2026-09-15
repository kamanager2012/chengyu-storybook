import { buildNarrationPlan } from "./narration-plan.mjs";
import { buildNarrationProvenanceEntries } from "./narration-rights.mjs";

const SHA256_RE = /^[a-f0-9]{64}$/;

function narrationAsset(item) {
  return {
    id: `audio:${item.output}`,
    category: "narration",
    label: item.output,
    path: item.output,
    fingerprintSha256: item.audioSha256,
    narrationStatus: item.status,
    storyId: item.storyId,
    pageId: item.pageId,
  };
}

export function buildNarrationRuntimeAvailability(options = {}) {
  const plan = options.plan ?? buildNarrationPlan({ includeDrafts: true });
  const buildProvenance = options.buildProvenance ?? buildNarrationProvenanceEntries;
  if (!plan || !Array.isArray(plan.items)) throw new Error("narration runtime availability requires a narration plan");

  const assets = plan.items.map(narrationAsset);
  const provenance = buildProvenance(assets, plan);
  if (!provenance || typeof provenance.entries !== "object" || !Array.isArray(provenance.issues)) {
    throw new Error("narration provenance generator returned an invalid result");
  }
  if (provenance.issues.length > 0) {
    throw new Error(`narration runtime availability provenance failed:\n${provenance.issues.join("\n")}`);
  }

  const availability = [];
  const keys = new Set();
  for (const item of plan.items) {
    if (item.status !== "current") continue;
    if (typeof item.storyId !== "string" || typeof item.pageId !== "string") {
      throw new Error(`current narration item lost its story/page identity: ${String(item.key)}`);
    }
    if (!SHA256_RE.test(item.audioSha256 ?? "")) {
      throw new Error(`current narration item lost its audio SHA-256: ${item.storyId}/${item.pageId}`);
    }

    const expectedOutput = `public/audio/${item.storyId}/${item.pageId}.mp3`;
    if (item.output !== expectedOutput) {
      throw new Error(`current narration item has a non-canonical runtime path: ${item.output}`);
    }

    const assetId = `audio:${item.output}`;
    const entry = provenance.entries[assetId];
    if (!entry) continue;
    if (entry.fingerprintSha256 !== item.audioSha256) {
      throw new Error(`narration provenance fingerprint mismatch: ${item.storyId}/${item.pageId}`);
    }

    const key = `${item.storyId}/${item.pageId}`;
    if (keys.has(key)) throw new Error(`duplicate narration runtime availability key: ${key}`);
    keys.add(key);
    availability.push({
      storyId: item.storyId,
      pageId: item.pageId,
      src: `/audio/${item.storyId}/${item.pageId}.mp3`,
      audioSha256: item.audioSha256,
    });
  }

  return availability;
}
