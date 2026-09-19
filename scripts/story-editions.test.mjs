import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EXPECTED_CHILD_ONLY_COUNT,
  EXPECTED_CHILD_OVERLAY_COUNT,
  EXPECTED_CHILD_SHELF_COUNT,
  EXPECTED_CLASSIC_ONLY_COUNT,
  EXPECTED_CLASSIC_SHELF_COUNT,
  EXPECTED_SHELF_CARD_COUNT,
  loadStoryEditions,
  runtimeStoryEditions,
  shelfHallsForStoryId,
} from "./story-editions.mjs";
import { EXPECTED_CHILD_OVERLAY_IDS, EXPECTED_GROK_CHILD_OVERLAY_COUNT, grokChildOverlayIds } from "./child-overlay.mjs";
import { loadStoryModel } from "./story-model.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("story editions pin children's public/stories art and expose a dual-hall shelf", () => {
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  const editions = loadStoryEditions({ publishedIds });

  assert.equal(editions.childOnly.length, EXPECTED_CHILD_ONLY_COUNT);
  assert.equal(editions.childOverlay.length, EXPECTED_CHILD_OVERLAY_COUNT);
  assert.equal(editions.childShelfCount, EXPECTED_CHILD_SHELF_COUNT);
  assert.equal(editions.classicCount, EXPECTED_CLASSIC_ONLY_COUNT);
  assert.equal(editions.classicShelfCount, EXPECTED_CLASSIC_SHELF_COUNT);
  assert.equal(editions.shelfCardCount, EXPECTED_SHELF_CARD_COUNT);
  assert.deepEqual(editions.gongbiClassicIds, editions.childOnly);
  const runtime = runtimeStoryEditions(editions);
  assert.deepEqual(runtime.grokChildOverlayIds, grokChildOverlayIds());
  assert.equal(runtime.grokChildOverlayIds.length, EXPECTED_GROK_CHILD_OVERLAY_COUNT);
  assert.equal(runtime.childOverlayIds.includes("xiong-you-cheng-zhu"), true);
  assert.equal(runtime.grokChildOverlayIds.includes("xiong-you-cheng-zhu"), true);
  assert.equal(runtime.grokChildOverlayIds.includes("po-fu-chen-zhou"), false);
  assert.equal(editions.childOnly[0], "shou-zhu");
  assert.equal(editions.childOnly[23], "yu-bang");
  assert.equal(editions.childOverlay[0], "xiong-you-cheng-zhu");
  assert.equal(editions.childOverlay[10], "zhi-shang-tan-bing");
  assert.equal(editions.childOverlay[11], "po-fu-chen-zhou");
  assert.equal(editions.childOverlay[12], "bei-shui-yi-zhan");
  assert.equal(editions.childOverlay[13], "si-mian-chu-ge");
  assert.equal(editions.childOverlay[14], "zhi-lu-wei-ma");
  assert.equal(editions.childOverlay[15], "lao-ma-shi-tu");
  assert.equal(editions.childOverlay[16], "chun-wang-chi-han");
  assert.equal(editions.childOverlay[17], "mao-sui-zi-jian");
  assert.equal(editions.childOverlay[18], "dong-shi-xiao-pin");
  assert.equal(editions.childOverlay[19], "han-dan-xue-bu");
  assert.equal(editions.childOverlay[20], "ban-men-nong-fu");
  assert.equal(editions.childOverlay[21], "bei-gong-she-ying");
  assert.equal(editions.childOverlay[22], "jing-gong-zhi-niao");
  assert.equal(editions.childOverlay[23], "bei-shui-che-xin");
  assert.equal(editions.childOverlay[24], "xue-zhong-song-tan");
  assert.equal(editions.childOverlay[25], "jin-shang-tian-hua");
  assert.equal(editions.childOverlay[26], "shui-di-shi-chuan");
  assert.equal(editions.childOverlay[27], "bai-bu-chuan-yang");
  assert.equal(editions.childOverlay[28], "shu-neng-sheng-qiao");
  assert.equal(editions.childOverlay[29], "yin-cai-shi-jiao");
  assert.equal(editions.childOverlay[30], "meng-mu-san-qian");
  assert.equal(editions.childOverlay[31], "kong-rong-rang-li");
  assert.equal(editions.childOverlay[32], "huang-liang-yi-meng");
  assert.equal(editions.childOverlay[33], "luo-yang-zhi-gui");
  assert.equal(editions.childOverlay[34], "jiang-lang-cai-jin");
  assert.equal(editions.childOverlay[35], "qing-chu-yu-lan");
  assert.equal(editions.childOverlay[36], "hou-lai-ju-shang");
  assert.equal(editions.childOverlay[37], "ming-luo-sun-shan");
  assert.equal(editions.childOverlay[38], "yi-zi-qian-jin");
  assert.equal(editions.childOverlay[39], "yi-nuo-qian-jin");
  assert.equal(editions.childOverlay[40], "tui-bi-san-she");
  assert.equal(editions.childOverlay[41], "wei-wei-jiu-zhao");
  assert.equal(editions.childOverlay[42], "yi-luan-ji-shi");
  assert.equal(editions.childOverlay[43], "tang-bi-dang-che");
  assert.equal(editions.childOverlay[44], "qian-lv-ji-qiong");
  assert.equal(editions.childOverlay[45], "san-ren-cheng-hu");
  assert.equal(editions.childOverlay[46], "bu-feng-zhuo-ying");
  assert.equal(editions.childOverlay[47], "feng-sheng-he-li");
  assert.equal(editions.childOverlay[48], "cao-mu-jie-bing");
  assert.equal(editions.childOverlay[49], "tou-bi-cong-rong");
  assert.equal(editions.childOverlay[50], "lao-sheng-chang-tan");
  assert.equal(editions.childOverlay[51], "le-bu-si-shu");
  assert.equal(editions.childOverlay[52], "de-long-wang-shu");
  assert.equal(editions.childOverlay[53], "wang-yang-xing-tan");
  assert.equal(editions.childOverlay[54], "ye-lang-zi-da");
  assert.equal(editions.childOverlay[55], "guan-zhong-kui-bao");
  assert.equal(editions.childOverlay[56], "yi-ye-zhang-mu");
  assert.equal(editions.childOverlay[57], "zou-ma-kan-hua");
  assert.equal(editions.childOverlay[58], "ru-mu-san-fen");
  assert.equal(editions.childOverlay[59], "miao-bi-sheng-hua");
  assert.equal(editions.childOverlay[60], "kai-juan-you-yi");
  assert.equal(editions.childOverlay[61], "shou-bu-shi-juan");
  assert.equal(editions.childOverlay[62], "wei-bian-san-jue");
  assert.equal(editions.childOverlay[63], "kou-ruo-xuan-he");
  assert.equal(editions.childOverlay[64], "dui-da-ru-liu");
  assert.equal(editions.childOverlay[65], "cai-gao-ba-dou");
  assert.equal(editions.childOverlay[66], "qi-bu-cheng-shi");
  assert.equal(editions.childOverlay[67], "peng-cheng-wan-li");
  assert.equal(editions.childOverlay[68], "da-qi-wan-cheng");
  assert.equal(editions.childOverlay[69], "lao-dang-yi-zhuang");
  assert.equal(editions.childOverlay[70], "hou-sheng-ke-wei");
  assert.equal(editions.childOverlay[71], "bu-chi-xia-wen");
  assert.equal(editions.childOverlay[72], "wen-gu-zhi-xin");
  assert.equal(editions.childOverlay[73], "ju-yi-fan-san");
  assert.equal(editions.childOverlay[74], "ban-tu-er-fei");
  assert.equal(editions.childOverlay[75], "gong-kui-yi-kui");
  assert.equal(editions.hallById.get("shou-zhu"), "child");
  assert.equal(editions.hallById.get("xiong-you-cheng-zhu"), "classic");
  assert.equal(editions.hallById.size, 100);
  assert.deepEqual(shelfHallsForStoryId("shou-zhu", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("xiong-you-cheng-zhu", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("po-fu-chen-zhou", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("bei-shui-yi-zhan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("si-mian-chu-ge", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("zhi-lu-wei-ma", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("lao-ma-shi-tu", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("chun-wang-chi-han", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("mao-sui-zi-jian", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("dong-shi-xiao-pin", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("han-dan-xue-bu", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("ban-men-nong-fu", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("bei-gong-she-ying", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("jing-gong-zhi-niao", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("bei-shui-che-xin", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("xue-zhong-song-tan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("jin-shang-tian-hua", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("shui-di-shi-chuan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("bai-bu-chuan-yang", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("shu-neng-sheng-qiao", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("yin-cai-shi-jiao", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("meng-mu-san-qian", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("kong-rong-rang-li", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("huang-liang-yi-meng", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("luo-yang-zhi-gui", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("jiang-lang-cai-jin", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("qing-chu-yu-lan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("hou-lai-ju-shang", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("ming-luo-sun-shan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("yi-zi-qian-jin", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("yi-nuo-qian-jin", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("tui-bi-san-she", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("wei-wei-jiu-zhao", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("yi-luan-ji-shi", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("tang-bi-dang-che", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("qian-lv-ji-qiong", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("shou-bu-shi-juan", editions), ["child", "classic"]);
  assert.deepEqual(shelfHallsForStoryId("gong-kui-yi-kui", editions), ["child", "classic"]);
});

test("story editions fail closed on missing child or classic-only ids", () => {
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  assert.throws(() => loadStoryEditions({ publishedIds: publishedIds.filter((id) => id !== "shou-zhu") }), /childOnly id is not in the published catalog/);
  assert.throws(() => loadStoryEditions({ publishedIds: publishedIds.filter((id) => id !== "xiong-you-cheng-zhu") }), /public\/stories classic-only set must contain exactly 76/);
});

test("classic-hall sections cover the full dual-hall catalog with seven pages and p6 title", () => {
  const classic = JSON.parse(readFileSync(join(repoRoot, "content/classic-hall-sections.json"), "utf8"));
  assert.equal(classic.schemaVersion, 1);
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  const editions = loadStoryEditions({ publishedIds });
  const ids = Object.keys(classic.stories);
  assert.equal(ids.length, publishedIds.length);
  assert.deepEqual([...ids].sort(), [...publishedIds].sort());
  for (const id of EXPECTED_CHILD_OVERLAY_IDS) assert.ok(classic.stories[id], id);
  for (const id of editions.childOnly) assert.ok(classic.stories[id], id);
  const published = Object.fromEntries(loadStoryModel().stories.map((story) => [story.id, story]));
  for (const id of ids) {
    const sections = classic.stories[id].sections;
    assert.equal(sections.length, 7, id);
    assert.ok(sections[5].includes(published[id].title), `${id} p6 must include title`);
    assert.match(sections[5], /后来人们把这个故事叫做/);
    const caption = /绘本风格|Q版|横构图|核心意象|16:9|严格遵照|严格遵循|准确演绎|严格演绎|画面中|无文字|古风工笔/;
    for (const [index, text] of sections.entries()) {
      assert.ok(text.trim().length > 6, `${id} p${index + 1} must be a readable sentence`);
      assert.equal(caption.test(text), false, `${id} p${index + 1} must not be a picture caption`);
    }
  }
});
