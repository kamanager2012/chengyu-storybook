import { expect, test } from "@playwright/test";
import { narrationPageSrcRe } from "./narration-src";
import { STORY_HREF_RE, storyIdFromHref } from "./story-href";

test("illustrated reader follows narration, pans the page, and sparks on a picture tap", async ({ page }) => {
  await page.goto("/hall/child", { waitUntil: "networkidle" });
  const link = page.locator('a[data-media-story="true"]').first();
  const href = await link.getAttribute("href");
  expect(href).toMatch(STORY_HREF_RE);
  const storyId = storyIdFromHref(href!);

  await link.click();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.locator('[data-page-sfx="true"]')).toBeVisible();
  await expect(page.locator('[data-picture-hotspot="true"]')).toHaveAttribute("data-page-motion", "in");
  await expect(page.locator(".book-stage img").first()).toHaveClass(/object-contain/);
  await expect(page.locator('[data-narration-follow="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /自动翻页|背景音乐|开始听故事|听讲解/ })).toHaveCount(0);

  const audio = page.locator('[data-narration-audio="true"]');
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p0"));
  if (!(await page.getByRole("button", { name: "暂停旁白" }).isVisible())) {
    await page.getByRole("button", { name: "播放旁白" }).click();
  }
  await expect(page.getByRole("button", { name: "暂停旁白" })).toBeVisible();
  await expect.poll(() => audio.evaluate((element) => element instanceof HTMLAudioElement && Number.isFinite(element.duration) && element.duration > 1)).toBeTruthy();
  await expect.poll(() => page.locator('[data-follow-token][data-active="true"]').count()).toBe(1);

  const spoken = page.locator('[data-follow-token][data-spoken="true"]');
  await spoken.nth((await spoken.count()) - 1).click();
  await expect.poll(async () =>
    audio.evaluate((element) => (element instanceof HTMLAudioElement && element.duration > 0 ? element.currentTime / element.duration : 0)),
  ).toBeGreaterThan(0.7);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("2 / 9", { exact: true })).toBeVisible();
  await expect(page.locator('[data-picture-hotspot="true"]')).toHaveAttribute("data-page-motion", "left");
  await expect(page.locator(".book-stage img").first()).toBeVisible();
  await expect(page.locator('[data-narration-follow="true"]')).toBeVisible();
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p1"));

  const stage = page.locator('[data-picture-hotspot="true"]');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + Math.min(150, box!.height * 0.2));
  await expect(page.locator('[data-picture-spark="true"]')).toHaveCount(1);
});
