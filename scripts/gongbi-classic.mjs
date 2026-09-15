import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { jpegSizeLabel, readJpegSize } from "./jpeg-size.mjs";
import { loadStoryEditions } from "./story-editions.mjs";
import { repoRoot } from "./story-model.mjs";

export const GONGBI_ROOT = "content/imagine-gongbi";
export const GONGBI_JPEG_ROOT = "content/imagine-gongbi-jpeg";
export const CLASSIC_PUBLIC_ROOT = "public/classic-stories";
export const GONGBI_SLOTS = Object.freeze(["cover", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
export const GONGBI_JPEG_BYTE_BUDGET = 450_000;
export const GONGBI_JPEG_COVER_SIZE = Object.freeze({ width: 768, height: 1024 });
export const GONGBI_JPEG_PAGE_SIZE = Object.freeze({ width: 1536, height: 1024 });
/** Pages re-exported from idiom redraw / child pipeline (1280 wide, height 852–853). */
export const GONGBI_JPEG_PAGE_ALT_SIZE = Object.freeze({ width: 1280, height: 853 });

function gongbiPageSizeOk(size) {
  if (!size) return false;
  if (size.width === GONGBI_JPEG_PAGE_SIZE.width && size.height === GONGBI_JPEG_PAGE_SIZE.height) return true;
  if (size.width !== GONGBI_JPEG_PAGE_ALT_SIZE.width) return false;
  return size.height === GONGBI_JPEG_PAGE_ALT_SIZE.height || size.height === GONGBI_JPEG_PAGE_ALT_SIZE.height - 1;
}

function pngSignature(buffer) {
  return (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

function jpegSignature(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function gongbiSourceFile(id, slot, root = repoRoot) {
  return join(root, GONGBI_ROOT, id, `${id}-${slot}.png`);
}

export function gongbiJpegFile(id, slot, root = repoRoot) {
  return join(root, GONGBI_JPEG_ROOT, id, `${slot}.jpg`);
}

export function classicPublicFile(id, slot, root = repoRoot) {
  return join(root, CLASSIC_PUBLIC_ROOT, id, `${slot}.jpg`);
}

export function classicCoverPath(id) {
  return `/classic-stories/${id}/cover.jpg`;
}

export function gongbiJpegReleasePaths(ids = loadStoryEditions().childOnly, root = repoRoot) {
  return ids.flatMap((id) => GONGBI_SLOTS.map((slot) => gongbiJpegFile(id, slot, root)));
}

export function assertGongbiClassicInventory(ids, root = repoRoot) {
  const errors = [];
  for (const id of ids) {
    for (const slot of GONGBI_SLOTS) {
      const jpegPath = gongbiJpegFile(id, slot, root);
      if (!existsSync(jpegPath)) {
        errors.push(`missing gongbi JPEG release: ${GONGBI_JPEG_ROOT}/${id}/${slot}.jpg`);
        continue;
      }
      const jpegHeader = readFileSync(jpegPath).subarray(0, 16);
      if (!jpegSignature(jpegHeader)) errors.push(`invalid gongbi JPEG signature: ${jpegPath}`);
      const bytes = statSync(jpegPath).size;
      if (bytes > GONGBI_JPEG_BYTE_BUDGET) {
        errors.push(`gongbi JPEG exceeds ${GONGBI_JPEG_BYTE_BUDGET} bytes: ${jpegPath} (${bytes})`);
      }
      const expected = slot === "cover" ? GONGBI_JPEG_COVER_SIZE : GONGBI_JPEG_PAGE_SIZE;
      const size = readJpegSize(jpegPath);
      const sizeOk =
        slot === "cover"
          ? size?.width === expected.width && size?.height === expected.height
          : gongbiPageSizeOk(size);
      if (!sizeOk) {
        errors.push(
          `gongbi JPEG size ${jpegSizeLabel(size)} not in classic ${expected.width}x${expected.height} or alt ${GONGBI_JPEG_PAGE_ALT_SIZE.width}x${GONGBI_JPEG_PAGE_ALT_SIZE.height}: ${jpegPath}`,
        );
      }
    }
  }
  if (errors.length > 0) throw new Error(`Invalid gongbi classic inventory:\n${errors.join("\n")}`);
}

function replaceWithHardlinkOrCopy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { force: true });
  try {
    linkSync(src, dest);
  } catch {
    copyFileSync(src, dest);
  }
}

export function syncGongbiClassicPublic(options = {}) {
  const root = options.root ?? repoRoot;
  const ids = options.ids ?? loadStoryEditions().childOnly;
  assertGongbiClassicInventory(ids, root);
  for (const id of ids) {
    for (const slot of GONGBI_SLOTS) {
      replaceWithHardlinkOrCopy(gongbiJpegFile(id, slot, root), classicPublicFile(id, slot, root));
      rmSync(join(root, CLASSIC_PUBLIC_ROOT, id, `${slot}.png`), { force: true });
    }
  }
  return { ids, count: ids.length * GONGBI_SLOTS.length };
}
