import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { jpegSizeLabel, readJpegSize } from "./jpeg-size.mjs";
import { repoRoot } from "./story-model.mjs";

export const CHILD_DRAFTS_ROOT = "content/imagine-child-drafts";
export const CHILD_PUBLIC_ROOT = "public/child-stories";
export const CHILD_PAGE_FILES = Object.freeze(["cover.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg", "p5.jpg", "p6.jpg", "p7.jpg"]);
export const EXPECTED_CHILD_OVERLAY_IDS = Object.freeze([
  "xiong-you-cheng-zhu",
  "wen-ji-qi-wu",
  "tie-chu-cheng-zhen",
  "nang-ying-ying-xue",
  "zao-bi-tou-guang",
  "cheng-men-li-xue",
  "san-gu-mao-lu",
  "cao-chuan-jie-jian",
  "wan-bi-gui-zhao",
  "fu-jing-qing-zui",
  "zhi-shang-tan-bing",
  "po-fu-chen-zhou",
  "bei-shui-yi-zhan",
  "si-mian-chu-ge",
  "zhi-lu-wei-ma",
  "lao-ma-shi-tu",
  "chun-wang-chi-han",
  "mao-sui-zi-jian",
  "dong-shi-xiao-pin",
  "han-dan-xue-bu",
  "ban-men-nong-fu",
  "bei-gong-she-ying",
  "jing-gong-zhi-niao",
  "bei-shui-che-xin",
  "xue-zhong-song-tan",
  "jin-shang-tian-hua",
  "shui-di-shi-chuan",
  "bai-bu-chuan-yang",
  "shu-neng-sheng-qiao",
  "yin-cai-shi-jiao",
  "meng-mu-san-qian",
  "kong-rong-rang-li",
  "huang-liang-yi-meng",
  "luo-yang-zhi-gui",
  "jiang-lang-cai-jin",
  "qing-chu-yu-lan",
  "hou-lai-ju-shang",
  "ming-luo-sun-shan",
  "yi-zi-qian-jin",
  "yi-nuo-qian-jin",
  "tui-bi-san-she",
  "wei-wei-jiu-zhao",
  "yi-luan-ji-shi",
  "tang-bi-dang-che",
  "qian-lv-ji-qiong",
  "san-ren-cheng-hu",
  "bu-feng-zhuo-ying",
  "feng-sheng-he-li",
  "cao-mu-jie-bing",
  "tou-bi-cong-rong",
  "lao-sheng-chang-tan",
  "le-bu-si-shu",
  "de-long-wang-shu",
  "wang-yang-xing-tan",
  "ye-lang-zi-da",
  "guan-zhong-kui-bao",
  "yi-ye-zhang-mu",
  "zou-ma-kan-hua",
  "ru-mu-san-fen",
  "miao-bi-sheng-hua",
  "kai-juan-you-yi",
  "shou-bu-shi-juan",
  "wei-bian-san-jue",
  "kou-ruo-xuan-he",
  "dui-da-ru-liu",
  "cai-gao-ba-dou",
  "qi-bu-cheng-shi",
  "peng-cheng-wan-li",
  "da-qi-wan-cheng",
  "lao-dang-yi-zhuang",
  "hou-sheng-ke-wei",
  "bu-chi-xia-wen",
  "wen-gu-zhi-xin",
  "ju-yi-fan-san",
  "ban-tu-er-fei",
  "gong-kui-yi-kui",
]);
export const EXPECTED_CHILD_OVERLAY_COUNT = EXPECTED_CHILD_OVERLAY_IDS.length;
export const GROK_CHILD_OVERLAY_SOURCE = "grok-imagine";
export const CURSOR_CHILD_OVERLAY_SOURCE = "cursor-generate-image";
export const EXPECTED_GROK_CHILD_OVERLAY_COUNT = 11;
export const EXPECTED_CURSOR_CHILD_OVERLAY_COUNT = 65;
/** When per-book generator logs are absent, Grok overlay books stay the first 11 child-overlay ids. */
export const GROK_CHILD_OVERLAY_IDS = Object.freeze(
  EXPECTED_CHILD_OVERLAY_IDS.slice(0, EXPECTED_GROK_CHILD_OVERLAY_COUNT),
);
export const CHILD_OVERLAY_COVER_SIZE = Object.freeze({ width: 1200, height: 1600 });
export const CHILD_OVERLAY_PAGE_SIZE = Object.freeze({ width: 1280, height: 853 });

function jpegSignature(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function childDraftFile(id, name, root = repoRoot) {
  return join(root, CHILD_DRAFTS_ROOT, id, name);
}

export function childOverlayDraftPaths(ids = EXPECTED_CHILD_OVERLAY_IDS, root = repoRoot) {
  return ids.flatMap((id) => CHILD_PAGE_FILES.map((name) => childDraftFile(id, name, root)));
}

export function childOverlayLogSource(id, root = repoRoot) {
  const logPath = join(root, CHILD_DRAFTS_ROOT, "logs", `${id}.json`);
  if (!existsSync(logPath)) {
    return GROK_CHILD_OVERLAY_IDS.includes(id) ? GROK_CHILD_OVERLAY_SOURCE : CURSOR_CHILD_OVERLAY_SOURCE;
  }
  const log = JSON.parse(readFileSync(logPath, "utf8"));
  if (typeof log?.source === "string") return log.source;
  return GROK_CHILD_OVERLAY_IDS.includes(id) ? GROK_CHILD_OVERLAY_SOURCE : CURSOR_CHILD_OVERLAY_SOURCE;
}

export function grokChildOverlayIds(ids = EXPECTED_CHILD_OVERLAY_IDS, root = repoRoot) {
  return ids.filter((id) => childOverlayLogSource(id, root) === GROK_CHILD_OVERLAY_SOURCE);
}

export function childPublicFile(id, name, root = repoRoot) {
  return join(root, CHILD_PUBLIC_ROOT, id, name);
}

export function childCoverPath(id) {
  return `/child-stories/${id}/cover.jpg`;
}

export function assertChildOverlayInventory(ids = EXPECTED_CHILD_OVERLAY_IDS, root = repoRoot) {
  const errors = [];
  for (const id of ids) {
    const logPath = join(root, CHILD_DRAFTS_ROOT, "logs", `${id}.json`);
    if (existsSync(logPath)) {
      const log = JSON.parse(readFileSync(logPath, "utf8"));
      if (log.status !== "complete-8") errors.push(`${id}: child overlay log must be complete-8`);
      if (log.edition !== "child") errors.push(`${id}: child overlay log edition must be child`);
      const listed = Array.isArray(log.files) ? log.files.map((file) => file.name).sort() : [];
      if (JSON.stringify(listed) !== JSON.stringify([...CHILD_PAGE_FILES].sort())) {
        errors.push(`${id}: child overlay log must list cover plus p1–p7`);
      }
    }
    for (const name of CHILD_PAGE_FILES) {
      const path = childDraftFile(id, name, root);
      if (!existsSync(path)) {
        errors.push(`missing child overlay asset: ${CHILD_DRAFTS_ROOT}/${id}/${name}`);
        continue;
      }
      if (!jpegSignature(readFileSync(path).subarray(0, 16))) errors.push(`invalid child overlay JPEG signature: ${path}`);
      const expected = name === "cover.jpg" ? CHILD_OVERLAY_COVER_SIZE : CHILD_OVERLAY_PAGE_SIZE;
      const size = readJpegSize(path);
      const heightOk =
        name === "cover.jpg"
          ? size?.height === expected.height
          : size?.height === expected.height || size?.height === expected.height - 1;
      if (!size || size.width !== expected.width || !heightOk) {
        errors.push(`child overlay JPEG size ${jpegSizeLabel(size)} != ${expected.width}x${expected.height}: ${path}`);
      }
    }
  }
  if (errors.length > 0) throw new Error(`Invalid child overlay inventory:\n${errors.join("\n")}`);
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

export function syncChildOverlayPublic(options = {}) {
  const root = options.root ?? repoRoot;
  const ids = options.ids ?? EXPECTED_CHILD_OVERLAY_IDS;
  assertChildOverlayInventory(ids, root);
  for (const id of ids) {
    for (const name of CHILD_PAGE_FILES) {
      replaceWithHardlinkOrCopy(childDraftFile(id, name, root), childPublicFile(id, name, root));
    }
  }
  return { ids, count: ids.length * CHILD_PAGE_FILES.length };
}
