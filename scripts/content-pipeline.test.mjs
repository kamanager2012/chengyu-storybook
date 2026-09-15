import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildContentReport } from "./content-report.mjs";
import { buildNarrationPlan, readNarrationState } from "./narration-plan.mjs";
import { buildRuntimeStoryIndex } from "./runtime-story-index.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const model = loadStoryModel();

test("all content tooling consumes the rewritten canonical story source", () => {
  const report = buildContentReport();
  const plan = buildNarrationPlan();
  assert.equal(report.canonicalSource, "content/published-stories.json");
  assert.equal(plan.canonicalSource, "content/published-stories.json");
  assert.equal(report.totals.stories, model.stories.length);
  assert.equal(report.totals.pages, model.pages.length);
  assert.equal(plan.items.length, model.pages.length);
  assert.deepEqual(report.issues, [], `content report issues: ${report.issues.join("; ")}`);
  assert.equal(report.dualHall.releaseStoryImages, 800);
  assert.equal(report.dualHall.childOverlayImages, 608);
  assert.equal(report.dualHall.gongbiJpegImages, 192);
  assert.equal(report.dualHall.overlayRightsClaimApplied, false);
  assert.equal(report.dualHall.overlayReleaseClaimApplied, true);
  assert.equal(report.dualHall.overlayInReleaseSet, true);
  assert.equal(report.dualHall.gongbiRightsClaimApplied, true);
  assert.equal(report.dualHall.gongbiInReleaseSet, true);
  assert.equal(report.dualHall.productReady, true);
});

test("runtime shelf index is canonical-derived and metadata-only", () => {
  const index = buildRuntimeStoryIndex();
  const media = index.filter((item) => item.kind === "media");
  const text = index.filter((item) => item.kind === "text");
  assert.equal(index.length, 200);
  assert.equal(media.length, 200);
  assert.equal(text.length, 0);
  assert.equal(new Set(index.map((item) => item.id)).size, 100);
  assert.equal(new Set(index.map((item) => `${item.id}:${item.hall}`)).size, 200);

  const mediaKeys = ["cover", "hall", "id", "kind", "pinyin", "tagline", "title", "tone"].sort();
  const textKeys = ["hall", "id", "kind", "pinyin", "tagline", "title", "tone"].sort();
  const halls = { child: 0, classic: 0 };
  for (const item of index) {
    assert.equal(item.hall === "child" || item.hall === "classic", true, `${item.id}: hall must be child or classic`);
    halls[item.hall] += 1;
  }
  assert.equal(halls.child, 100);
  assert.equal(halls.classic, 100);

  const childShouZhu = index.find((item) => item.id === "shou-zhu" && item.hall === "child");
  const classicShouZhu = index.find((item) => item.id === "shou-zhu" && item.hall === "classic");
  const childXiongYou = index.find((item) => item.id === "xiong-you-cheng-zhu" && item.hall === "child");
  const classicXiongYou = index.find((item) => item.id === "xiong-you-cheng-zhu" && item.hall === "classic");
  const childBeiShui = index.find((item) => item.id === "bei-shui-yi-zhan" && item.hall === "child");
  const classicBeiShui = index.find((item) => item.id === "bei-shui-yi-zhan" && item.hall === "classic");
  assert.equal(childShouZhu?.cover.endsWith("/stories/shou-zhu/cover.jpg"), true);
  assert.equal(classicShouZhu?.cover.endsWith("/classic-stories/shou-zhu/cover.jpg"), true);
  assert.equal(childXiongYou?.cover.endsWith("/child-stories/xiong-you-cheng-zhu/cover.jpg"), true);
  assert.equal(classicXiongYou?.cover.endsWith("/stories/xiong-you-cheng-zhu/cover.jpg"), true);
  assert.equal(childBeiShui?.cover.endsWith("/child-stories/bei-shui-yi-zhan/cover.jpg"), true);
  assert.equal(classicBeiShui?.cover.endsWith("/stories/bei-shui-yi-zhan/cover.jpg"), true);
  const childSiMian = index.find((item) => item.id === "si-mian-chu-ge" && item.hall === "child");
  const classicSiMian = index.find((item) => item.id === "si-mian-chu-ge" && item.hall === "classic");
  assert.equal(childSiMian?.cover.endsWith("/child-stories/si-mian-chu-ge/cover.jpg"), true);
  assert.equal(classicSiMian?.cover.endsWith("/stories/si-mian-chu-ge/cover.jpg"), true);
  const childZhiLu = index.find((item) => item.id === "zhi-lu-wei-ma" && item.hall === "child");
  const classicZhiLu = index.find((item) => item.id === "zhi-lu-wei-ma" && item.hall === "classic");
  assert.equal(childZhiLu?.cover.endsWith("/child-stories/zhi-lu-wei-ma/cover.jpg"), true);
  assert.equal(classicZhiLu?.cover.endsWith("/stories/zhi-lu-wei-ma/cover.jpg"), true);
  const childLaoMa = index.find((item) => item.id === "lao-ma-shi-tu" && item.hall === "child");
  const classicLaoMa = index.find((item) => item.id === "lao-ma-shi-tu" && item.hall === "classic");
  assert.equal(childLaoMa?.cover.endsWith("/child-stories/lao-ma-shi-tu/cover.jpg"), true);
  assert.equal(classicLaoMa?.cover.endsWith("/stories/lao-ma-shi-tu/cover.jpg"), true);
  const childChunWang = index.find((item) => item.id === "chun-wang-chi-han" && item.hall === "child");
  const classicChunWang = index.find((item) => item.id === "chun-wang-chi-han" && item.hall === "classic");
  assert.equal(childChunWang?.cover.endsWith("/child-stories/chun-wang-chi-han/cover.jpg"), true);
  assert.equal(classicChunWang?.cover.endsWith("/stories/chun-wang-chi-han/cover.jpg"), true);
  const childMaoSui = index.find((item) => item.id === "mao-sui-zi-jian" && item.hall === "child");
  const classicMaoSui = index.find((item) => item.id === "mao-sui-zi-jian" && item.hall === "classic");
  assert.equal(childMaoSui?.cover.endsWith("/child-stories/mao-sui-zi-jian/cover.jpg"), true);
  assert.equal(classicMaoSui?.cover.endsWith("/stories/mao-sui-zi-jian/cover.jpg"), true);
  const childDongShi = index.find((item) => item.id === "dong-shi-xiao-pin" && item.hall === "child");
  const classicDongShi = index.find((item) => item.id === "dong-shi-xiao-pin" && item.hall === "classic");
  assert.equal(childDongShi?.cover.endsWith("/child-stories/dong-shi-xiao-pin/cover.jpg"), true);
  assert.equal(classicDongShi?.cover.endsWith("/stories/dong-shi-xiao-pin/cover.jpg"), true);
  const childHanDan = index.find((item) => item.id === "han-dan-xue-bu" && item.hall === "child");
  const classicHanDan = index.find((item) => item.id === "han-dan-xue-bu" && item.hall === "classic");
  assert.equal(childHanDan?.cover.endsWith("/child-stories/han-dan-xue-bu/cover.jpg"), true);
  assert.equal(classicHanDan?.cover.endsWith("/stories/han-dan-xue-bu/cover.jpg"), true);
  const childBanMen = index.find((item) => item.id === "ban-men-nong-fu" && item.hall === "child");
  const classicBanMen = index.find((item) => item.id === "ban-men-nong-fu" && item.hall === "classic");
  assert.equal(childBanMen?.cover.endsWith("/child-stories/ban-men-nong-fu/cover.jpg"), true);
  assert.equal(classicBanMen?.cover.endsWith("/stories/ban-men-nong-fu/cover.jpg"), true);
  const childBeiGong = index.find((item) => item.id === "bei-gong-she-ying" && item.hall === "child");
  const classicBeiGong = index.find((item) => item.id === "bei-gong-she-ying" && item.hall === "classic");
  assert.equal(childBeiGong?.cover.endsWith("/child-stories/bei-gong-she-ying/cover.jpg"), true);
  assert.equal(classicBeiGong?.cover.endsWith("/stories/bei-gong-she-ying/cover.jpg"), true);
  const childJingGong = index.find((item) => item.id === "jing-gong-zhi-niao" && item.hall === "child");
  const classicJingGong = index.find((item) => item.id === "jing-gong-zhi-niao" && item.hall === "classic");
  assert.equal(childJingGong?.cover.endsWith("/child-stories/jing-gong-zhi-niao/cover.jpg"), true);
  assert.equal(classicJingGong?.cover.endsWith("/stories/jing-gong-zhi-niao/cover.jpg"), true);
  const childBeiShuiChe = index.find((item) => item.id === "bei-shui-che-xin" && item.hall === "child");
  const classicBeiShuiChe = index.find((item) => item.id === "bei-shui-che-xin" && item.hall === "classic");
  assert.equal(childBeiShuiChe?.cover.endsWith("/child-stories/bei-shui-che-xin/cover.jpg"), true);
  assert.equal(classicBeiShuiChe?.cover.endsWith("/stories/bei-shui-che-xin/cover.jpg"), true);
  const childXueZhong = index.find((item) => item.id === "xue-zhong-song-tan" && item.hall === "child");
  const classicXueZhong = index.find((item) => item.id === "xue-zhong-song-tan" && item.hall === "classic");
  assert.equal(childXueZhong?.cover.endsWith("/child-stories/xue-zhong-song-tan/cover.jpg"), true);
  assert.equal(classicXueZhong?.cover.endsWith("/stories/xue-zhong-song-tan/cover.jpg"), true);
  const childJinShang = index.find((item) => item.id === "jin-shang-tian-hua" && item.hall === "child");
  const classicJinShang = index.find((item) => item.id === "jin-shang-tian-hua" && item.hall === "classic");
  assert.equal(childJinShang?.cover.endsWith("/child-stories/jin-shang-tian-hua/cover.jpg"), true);
  assert.equal(classicJinShang?.cover.endsWith("/stories/jin-shang-tian-hua/cover.jpg"), true);
  const childShuiDi = index.find((item) => item.id === "shui-di-shi-chuan" && item.hall === "child");
  const classicShuiDi = index.find((item) => item.id === "shui-di-shi-chuan" && item.hall === "classic");
  assert.equal(childShuiDi?.cover.endsWith("/child-stories/shui-di-shi-chuan/cover.jpg"), true);
  assert.equal(classicShuiDi?.cover.endsWith("/stories/shui-di-shi-chuan/cover.jpg"), true);
  const childBaiBu = index.find((item) => item.id === "bai-bu-chuan-yang" && item.hall === "child");
  const classicBaiBu = index.find((item) => item.id === "bai-bu-chuan-yang" && item.hall === "classic");
  assert.equal(childBaiBu?.cover.endsWith("/child-stories/bai-bu-chuan-yang/cover.jpg"), true);
  assert.equal(classicBaiBu?.cover.endsWith("/stories/bai-bu-chuan-yang/cover.jpg"), true);
  const childShuNeng = index.find((item) => item.id === "shu-neng-sheng-qiao" && item.hall === "child");
  const classicShuNeng = index.find((item) => item.id === "shu-neng-sheng-qiao" && item.hall === "classic");
  assert.equal(childShuNeng?.cover.endsWith("/child-stories/shu-neng-sheng-qiao/cover.jpg"), true);
  assert.equal(classicShuNeng?.cover.endsWith("/stories/shu-neng-sheng-qiao/cover.jpg"), true);
  const childYinCai = index.find((item) => item.id === "yin-cai-shi-jiao" && item.hall === "child");
  const classicYinCai = index.find((item) => item.id === "yin-cai-shi-jiao" && item.hall === "classic");
  assert.equal(childYinCai?.cover.endsWith("/child-stories/yin-cai-shi-jiao/cover.jpg"), true);
  assert.equal(classicYinCai?.cover.endsWith("/stories/yin-cai-shi-jiao/cover.jpg"), true);
  const childMengMu = index.find((item) => item.id === "meng-mu-san-qian" && item.hall === "child");
  const classicMengMu = index.find((item) => item.id === "meng-mu-san-qian" && item.hall === "classic");
  assert.equal(childMengMu?.cover.endsWith("/child-stories/meng-mu-san-qian/cover.jpg"), true);
  assert.equal(classicMengMu?.cover.endsWith("/stories/meng-mu-san-qian/cover.jpg"), true);
  const childKongRong = index.find((item) => item.id === "kong-rong-rang-li" && item.hall === "child");
  const classicKongRong = index.find((item) => item.id === "kong-rong-rang-li" && item.hall === "classic");
  assert.equal(childKongRong?.cover.endsWith("/child-stories/kong-rong-rang-li/cover.jpg"), true);
  assert.equal(classicKongRong?.cover.endsWith("/stories/kong-rong-rang-li/cover.jpg"), true);
  const childHuangLiang = index.find((item) => item.id === "huang-liang-yi-meng" && item.hall === "child");
  const classicHuangLiang = index.find((item) => item.id === "huang-liang-yi-meng" && item.hall === "classic");
  assert.equal(childHuangLiang?.cover.endsWith("/child-stories/huang-liang-yi-meng/cover.jpg"), true);
  assert.equal(classicHuangLiang?.cover.endsWith("/stories/huang-liang-yi-meng/cover.jpg"), true);
  const childLuoYang = index.find((item) => item.id === "luo-yang-zhi-gui" && item.hall === "child");
  const classicLuoYang = index.find((item) => item.id === "luo-yang-zhi-gui" && item.hall === "classic");
  assert.equal(childLuoYang?.cover.endsWith("/child-stories/luo-yang-zhi-gui/cover.jpg"), true);
  assert.equal(classicLuoYang?.cover.endsWith("/stories/luo-yang-zhi-gui/cover.jpg"), true);
  const childJiangLang = index.find((item) => item.id === "jiang-lang-cai-jin" && item.hall === "child");
  const classicJiangLang = index.find((item) => item.id === "jiang-lang-cai-jin" && item.hall === "classic");
  assert.equal(childJiangLang?.cover.endsWith("/child-stories/jiang-lang-cai-jin/cover.jpg"), true);
  assert.equal(classicJiangLang?.cover.endsWith("/stories/jiang-lang-cai-jin/cover.jpg"), true);
  const childQingChu = index.find((item) => item.id === "qing-chu-yu-lan" && item.hall === "child");
  const classicQingChu = index.find((item) => item.id === "qing-chu-yu-lan" && item.hall === "classic");
  assert.equal(childQingChu?.cover.endsWith("/child-stories/qing-chu-yu-lan/cover.jpg"), true);
  assert.equal(classicQingChu?.cover.endsWith("/stories/qing-chu-yu-lan/cover.jpg"), true);
  const childHouLai = index.find((item) => item.id === "hou-lai-ju-shang" && item.hall === "child");
  const classicHouLai = index.find((item) => item.id === "hou-lai-ju-shang" && item.hall === "classic");
  assert.equal(childHouLai?.cover.endsWith("/child-stories/hou-lai-ju-shang/cover.jpg"), true);
  assert.equal(classicHouLai?.cover.endsWith("/stories/hou-lai-ju-shang/cover.jpg"), true);
  const childMingLuo = index.find((item) => item.id === "ming-luo-sun-shan" && item.hall === "child");
  const classicMingLuo = index.find((item) => item.id === "ming-luo-sun-shan" && item.hall === "classic");
  assert.equal(childMingLuo?.cover.endsWith("/child-stories/ming-luo-sun-shan/cover.jpg"), true);
  assert.equal(classicMingLuo?.cover.endsWith("/stories/ming-luo-sun-shan/cover.jpg"), true);
  const childYiZi = index.find((item) => item.id === "yi-zi-qian-jin" && item.hall === "child");
  const classicYiZi = index.find((item) => item.id === "yi-zi-qian-jin" && item.hall === "classic");
  assert.equal(childYiZi?.cover.endsWith("/child-stories/yi-zi-qian-jin/cover.jpg"), true);
  assert.equal(classicYiZi?.cover.endsWith("/stories/yi-zi-qian-jin/cover.jpg"), true);
  const childYiNuo = index.find((item) => item.id === "yi-nuo-qian-jin" && item.hall === "child");
  const classicYiNuo = index.find((item) => item.id === "yi-nuo-qian-jin" && item.hall === "classic");
  assert.equal(childYiNuo?.cover.endsWith("/child-stories/yi-nuo-qian-jin/cover.jpg"), true);
  assert.equal(classicYiNuo?.cover.endsWith("/stories/yi-nuo-qian-jin/cover.jpg"), true);
  const childTuiBi = index.find((item) => item.id === "tui-bi-san-she" && item.hall === "child");
  const classicTuiBi = index.find((item) => item.id === "tui-bi-san-she" && item.hall === "classic");
  assert.equal(childTuiBi?.cover.endsWith("/child-stories/tui-bi-san-she/cover.jpg"), true);
  assert.equal(classicTuiBi?.cover.endsWith("/stories/tui-bi-san-she/cover.jpg"), true);
  const childWeiWei = index.find((item) => item.id === "wei-wei-jiu-zhao" && item.hall === "child");
  const classicWeiWei = index.find((item) => item.id === "wei-wei-jiu-zhao" && item.hall === "classic");
  assert.equal(childWeiWei?.cover.endsWith("/child-stories/wei-wei-jiu-zhao/cover.jpg"), true);
  assert.equal(classicWeiWei?.cover.endsWith("/stories/wei-wei-jiu-zhao/cover.jpg"), true);
  const childYiLuan = index.find((item) => item.id === "yi-luan-ji-shi" && item.hall === "child");
  const classicYiLuan = index.find((item) => item.id === "yi-luan-ji-shi" && item.hall === "classic");
  assert.equal(childYiLuan?.cover.endsWith("/child-stories/yi-luan-ji-shi/cover.jpg"), true);
  assert.equal(classicYiLuan?.cover.endsWith("/stories/yi-luan-ji-shi/cover.jpg"), true);
  const childTangBi = index.find((item) => item.id === "tang-bi-dang-che" && item.hall === "child");
  const classicTangBi = index.find((item) => item.id === "tang-bi-dang-che" && item.hall === "classic");
  assert.equal(childTangBi?.cover.endsWith("/child-stories/tang-bi-dang-che/cover.jpg"), true);
  assert.equal(classicTangBi?.cover.endsWith("/stories/tang-bi-dang-che/cover.jpg"), true);
  const childQianLv = index.find((item) => item.id === "qian-lv-ji-qiong" && item.hall === "child");
  const classicQianLv = index.find((item) => item.id === "qian-lv-ji-qiong" && item.hall === "classic");
  assert.equal(childQianLv?.cover.endsWith("/child-stories/qian-lv-ji-qiong/cover.jpg"), true);
  assert.equal(classicQianLv?.cover.endsWith("/stories/qian-lv-ji-qiong/cover.jpg"), true);
  const childShouBu = index.find((item) => item.id === "shou-bu-shi-juan" && item.hall === "child");
  const classicShouBu = index.find((item) => item.id === "shou-bu-shi-juan" && item.hall === "classic");
  assert.equal(childShouBu?.cover.endsWith("/child-stories/shou-bu-shi-juan/cover.jpg"), true);
  assert.equal(classicShouBu?.cover.endsWith("/stories/shou-bu-shi-juan/cover.jpg"), true);
  const childGongKui = index.find((item) => item.id === "gong-kui-yi-kui" && item.hall === "child");
  const classicGongKui = index.find((item) => item.id === "gong-kui-yi-kui" && item.hall === "classic");
  assert.equal(childGongKui?.cover.endsWith("/child-stories/gong-kui-yi-kui/cover.jpg"), true);
  assert.equal(classicGongKui?.cover.endsWith("/stories/gong-kui-yi-kui/cover.jpg"), true);
  const forbidden = ["meaning", "moral", "sections", "pages", "audio", "image"];
  for (const item of index) {
    assert.deepEqual(Object.keys(item).sort(), item.kind === "media" ? mediaKeys : textKeys, `${item.id}: unexpected shelf metadata fields`);
    for (const key of forbidden) assert.equal(key in item, false, `${item.id}: full story field leaked into shelf index: ${key}`);
  }

  const home = readFileSync(join(repoRoot, "src/routes/index.tsx"), "utf8");
  assert.match(home, /@\/data\/story-index/);
  assert.equal(home.includes("@/data/story-catalog"), false);

  const vite = readFileSync(join(repoRoot, "vite.config.ts"), "utf8");
  assert.match(vite, /buildRuntimeStoryIndex/);
  assert.match(vite, /__STORY_INDEX__/);
  assert.match(vite, /__STORY_EDITIONS__/);
});

test("story route chooses lightweight metadata before lazy-loading full story bodies", () => {
  const route = readFileSync(join(repoRoot, "src/routes/story.$id.tsx"), "utf8");
  assert.match(route, /@\/data\/story-index/);
  assert.equal(/from\s+["']@\/data\/stories["']/.test(route), false, "published full-body data must not be a static dependency");
  assert.equal(/from\s+["']@\/data\/story-catalog["']/.test(route), false, "draft full-body catalog must not be a static dependency");

  const dynamicImport = ["imp", "ort"].join("");
  const lookup = route.indexOf("storyIndex.find");
  const mediaImport = route.indexOf(`${dynamicImport}("@/data/stories")`);
  const draftImport = route.indexOf(`${dynamicImport}("@/data/story-catalog")`);
  assert.ok(lookup >= 0, "story route must classify the id using the lightweight runtime index");
  assert.ok(mediaImport > lookup, "media full-body data must be lazy-loaded after id classification");
  assert.ok(draftImport > lookup, "draft full-body data must be lazy-loaded after id classification");
});

test("draft full-body adapter does not pull published media bodies into the text-story chunk", () => {
  const catalog = readFileSync(join(repoRoot, "src/data/story-catalog.ts"), "utf8");
  assert.match(catalog, /import type \{ Story(?:, StoryPage)? \} from ["']\.\/stories["']/);
  assert.equal(catalog.includes("mediaStories"), false, "draft adapter must not runtime-import published media stories");
  assert.equal(catalog.includes("storyCatalog"), false, "combined 100-story full-body catalog must not return");
  assert.match(catalog, /draftStories\.length !== 0/);
  assert.match(catalog, /export function getDraftStory/);
});

test("narration provenance state is explicit and versioned", () => {
  const state = readNarrationState();
  assert.equal(state.schemaVersion, 1);
  assert.equal(typeof state.entries, "object");
  const allowed = new Set(["current", "stale", "unverified", "missing"]);
  for (const item of buildNarrationPlan().items) {
    assert.equal(allowed.has(item.status), true, `unexpected narration status for ${item.key}: ${item.status}`);
    assert.match(item.textSha256, /^[a-f0-9]{64}$/);
  }
});

test("obsolete content, direct-state generators, and retired reader state cannot return", () => {
  for (const path of [
    "scripts/expand-stories.py",
    "scripts/generate-narration.py",
    "scripts/generate-narration-2.py",
    "src/components/story-reader.tsx",
    "src/components/highlighted-text.tsx",
    "src/lib/highlight.ts",
    "src/lib/music.ts",
    "src/lib/progress.ts",
  ]) {
    assert.equal(existsSync(join(repoRoot, path)), false, `${path} is retired and must not return to the active runtime`);
  }

  const guard = readFileSync(join(repoRoot, "scripts/generate-narration.mjs"), "utf8");
  assert.match(guard, /assertNarrationExpansionAllowed/);
  assert.match(guard, /generate-narration-core\.mjs/);

  const generator = readFileSync(join(repoRoot, "scripts/generate-narration-core.mjs"), "utf8");
  assert.match(generator, /buildNarrationPlan/);
  assert.match(generator, /validateApprovedGenerationSet/);
  assert.match(generator, /buildKokoroNarrationReceipt/);
  assert.match(generator, /narrationStateUpdated:\s*false/);
  assert.match(generator, /narration:import/);

  for (const forbidden of [
    "api.x.ai",
    "XAI_API_KEY",
    "XAI_TTS_VOICE_ID",
    "narrationStatePath",
    "readNarrationState",
  ]) {
    assert.equal(generator.includes(forbidden), false, `retired narration implementation token returned: ${forbidden}`);
  }
});
