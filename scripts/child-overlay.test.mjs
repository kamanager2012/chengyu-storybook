import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CHILD_PAGE_FILES,
  CHILD_PUBLIC_ROOT,
  EXPECTED_CHILD_OVERLAY_COUNT,
  EXPECTED_CHILD_OVERLAY_IDS,
  EXPECTED_CURSOR_CHILD_OVERLAY_COUNT,
  EXPECTED_GROK_CHILD_OVERLAY_COUNT,
  assertChildOverlayInventory,
  childCoverPath,
  childDraftFile,
  grokChildOverlayIds,
  syncChildOverlayPublic,
} from "./child-overlay.mjs";
import { loadStoryEditions } from "./story-editions.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

test("child overlay inventory is the live complete-8 children's redraws of 古风馆 ids", () => {
  const publishedIds = loadStoryModel().stories.map((story) => story.id);
  const editions = loadStoryEditions({ publishedIds });
  assert.equal(EXPECTED_CHILD_OVERLAY_IDS.length, EXPECTED_CHILD_OVERLAY_COUNT);
  assert.equal(grokChildOverlayIds().length, EXPECTED_GROK_CHILD_OVERLAY_COUNT);
  assert.equal(EXPECTED_GROK_CHILD_OVERLAY_COUNT + EXPECTED_CURSOR_CHILD_OVERLAY_COUNT, EXPECTED_CHILD_OVERLAY_COUNT);
  assert.deepEqual(grokChildOverlayIds(), EXPECTED_CHILD_OVERLAY_IDS.slice(0, EXPECTED_GROK_CHILD_OVERLAY_COUNT));
  assert.deepEqual(editions.childOverlay, [...EXPECTED_CHILD_OVERLAY_IDS]);
  assertChildOverlayInventory();
  assert.equal(childCoverPath("xiong-you-cheng-zhu"), "/child-stories/xiong-you-cheng-zhu/cover.jpg");
  assert.equal(editions.hallById.get("xiong-you-cheng-zhu"), "classic");
  assert.equal(editions.childOnly.includes("xiong-you-cheng-zhu"), false);
  for (const name of CHILD_PAGE_FILES) {
    assert.equal(existsSync(childDraftFile("zhi-shang-tan-bing", name)), true);
  }
});

test("child overlay sync maps draft JPEGs onto the child runtime root without touching public/stories 古风 art", () => {
  const result = syncChildOverlayPublic();
  assert.equal(result.ids.length, EXPECTED_CHILD_OVERLAY_COUNT);
  assert.equal(result.count, EXPECTED_CHILD_OVERLAY_COUNT * CHILD_PAGE_FILES.length);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "xiong-you-cheng-zhu", "cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "zhi-shang-tan-bing", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bei-shui-yi-zhan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "si-mian-chu-ge", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "zhi-lu-wei-ma", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "lao-ma-shi-tu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "chun-wang-chi-han", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "mao-sui-zi-jian", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "dong-shi-xiao-pin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "han-dan-xue-bu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ban-men-nong-fu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bei-gong-she-ying", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "jing-gong-zhi-niao", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bei-shui-che-xin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "xue-zhong-song-tan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "jin-shang-tian-hua", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "shui-di-shi-chuan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bai-bu-chuan-yang", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "shu-neng-sheng-qiao", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "yin-cai-shi-jiao", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "meng-mu-san-qian", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "kong-rong-rang-li", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "huang-liang-yi-meng", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "luo-yang-zhi-gui", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "jiang-lang-cai-jin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "qing-chu-yu-lan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "hou-lai-ju-shang", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ming-luo-sun-shan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "yi-zi-qian-jin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "yi-nuo-qian-jin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "tui-bi-san-she", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "wei-wei-jiu-zhao", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "yi-luan-ji-shi", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "tang-bi-dang-che", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "qian-lv-ji-qiong", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "san-ren-cheng-hu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bu-feng-zhuo-ying", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "feng-sheng-he-li", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "cao-mu-jie-bing", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "tou-bi-cong-rong", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "lao-sheng-chang-tan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "le-bu-si-shu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "de-long-wang-shu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "wang-yang-xing-tan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ye-lang-zi-da", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "guan-zhong-kui-bao", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "yi-ye-zhang-mu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "zou-ma-kan-hua", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ru-mu-san-fen", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "miao-bi-sheng-hua", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "kai-juan-you-yi", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "shou-bu-shi-juan", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "wei-bian-san-jue", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "kou-ruo-xuan-he", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "dui-da-ru-liu", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "cai-gao-ba-dou", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "qi-bu-cheng-shi", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "peng-cheng-wan-li", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "da-qi-wan-cheng", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "lao-dang-yi-zhuang", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "hou-sheng-ke-wei", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "bu-chi-xia-wen", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "wen-gu-zhi-xin", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ju-yi-fan-san", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "ban-tu-er-fei", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, CHILD_PUBLIC_ROOT, "gong-kui-yi-kui", "p7.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/xiong-you-cheng-zhu/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/bei-shui-yi-zhan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/si-mian-chu-ge/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/zhi-lu-wei-ma/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/lao-ma-shi-tu/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/chun-wang-chi-han/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/mao-sui-zi-jian/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/dong-shi-xiao-pin/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/han-dan-xue-bu/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/ban-men-nong-fu/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/bei-gong-she-ying/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/jing-gong-zhi-niao/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/bei-shui-che-xin/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/xue-zhong-song-tan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/jin-shang-tian-hua/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/shui-di-shi-chuan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/bai-bu-chuan-yang/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/shu-neng-sheng-qiao/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/yin-cai-shi-jiao/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/meng-mu-san-qian/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/kong-rong-rang-li/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/huang-liang-yi-meng/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/luo-yang-zhi-gui/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/jiang-lang-cai-jin/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/qing-chu-yu-lan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/hou-lai-ju-shang/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/ming-luo-sun-shan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/yi-zi-qian-jin/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/yi-nuo-qian-jin/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/tui-bi-san-she/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/wei-wei-jiu-zhao/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/yi-luan-ji-shi/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/tang-bi-dang-che/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/qian-lv-ji-qiong/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/shou-bu-shi-juan/cover.jpg")), true);
  assert.equal(existsSync(join(repoRoot, "public/stories/gong-kui-yi-kui/cover.jpg")), true);
});
