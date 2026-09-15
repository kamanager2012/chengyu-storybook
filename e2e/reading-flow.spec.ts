import { expect, test } from "@playwright/test";
import { narrationPageSrcRe } from "./narration-src";
import { STORY_HREF_RE, storyIdFromHref } from "./story-href";

const PROGRESS_KEY = "chengyu-progress-v1";
const SETTINGS_KEY = "chengyu-settings-v1";

async function firstIllustratedStory(page: import("@playwright/test").Page) {
  await page.goto("/hall/child", { waitUntil: "networkidle" });
  const link = page.locator('a[data-media-story="true"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(STORY_HREF_RE);
  return { link, href: href!, storyId: storyIdFromHref(href!) };
}

test("illustrated reading flow exposes verified narration without restoring legacy progress", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());

  const { link, storyId } = await firstIllustratedStory(page);
  await link.click();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.locator('[data-autoplay="true"]')).toBeVisible();
  await expect(page.locator('[data-narration-ready="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();
  const audio = page.locator('[data-narration-audio="true"]');
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p0"));

  await audio.evaluate((element) => element.dispatchEvent(new Event("ended")));
  await expect(page.getByText("2 / 9", { exact: true })).toBeVisible();
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p1"));
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();

  const pageDots = page.getByLabel("页码").getByRole("button");
  await expect(pageDots).toHaveCount(9);
  await pageDots.last().click();
  await expect(page.getByText("成语的意思", { exact: true })).toBeVisible();
  await expect(page.getByText("小道理", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();

  const progress = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PROGRESS_KEY);
  expect(progress[storyId], "verified narration availability must not restore retired listening progress").toBeUndefined();

  await page.getByRole("link", { name: "回书架", exact: true }).click();
  await expect(page.getByRole("heading", { name: "儿童馆", exact: true }).first()).toBeVisible();
  await expect(page.getByText(/已经听过/)).toHaveCount(0);
});

test("legacy listening settings cannot change the verified-only narration controller", async ({ page }) => {
  const { href, storyId } = await firstIllustratedStory(page);

  await page.evaluate(
    ({ progressKey, settingsKey, id }) => {
      localStorage.setItem(progressKey, JSON.stringify({ [id]: { stars: 3, heard: true }, junk: "broken" }));
      localStorage.setItem(settingsKey, JSON.stringify({ autoFlip: true, music: true }));
    },
    { progressKey: PROGRESS_KEY, settingsKey: SETTINGS_KEY, id: storyId },
  );

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(/已经听过/)).toHaveCount(0);
  await expect(page.locator(`a[href="${href}"]`).getByLabel(/颗星/)).toHaveCount(0);

  await page.goto(href, { waitUntil: "networkidle" });
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /自动翻页|背景音乐|开始听故事|听讲解/ })).toHaveCount(0);
  const audio = page.locator('[data-narration-audio="true"]');
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p0"));
});
