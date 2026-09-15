import { expect, test } from "@playwright/test";
import { isNarrationAudioPath, narrationPageSrcRe } from "./narration-src";
import { STORY_HREF_RE, storyIdFromHref } from "./story-href";

test("illustrated reader autoplays the current page and only loads that narration", async ({ page }, testInfo) => {
  const imageResponses = new Set<string>();
  const audioRequests: string[] = [];
  let storyId = "";

  page.on("response", (response) => {
    if (!response.ok() || !storyId) return;
    const path = new URL(response.url()).pathname;
    if (path.startsWith(`/stories/${storyId}/`) || path.startsWith(`/classic-stories/${storyId}/`) || path.startsWith(`/child-stories/${storyId}/`)) {
      if (/\.(?:jpg|jpeg|png|webp)$/.test(path)) imageResponses.add(path);
    }
  });
  page.on("request", (request) => {
    if (!storyId) return;
    const path = new URL(request.url()).pathname;
    if (isNarrationAudioPath(path, storyId)) audioRequests.push(path);
  });

  await page.goto("/hall/child", { waitUntil: "networkidle" });
  const href = await page.locator('a[data-media-story="true"]').first().getAttribute("href");
  expect(href).toMatch(STORY_HREF_RE);
  storyId = storyIdFromHref(href!);
  imageResponses.clear();
  audioRequests.length = 0;

  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.locator('[data-autoplay="true"]')).toBeVisible();
  await expect(page.locator('[data-narration-ready="true"]')).toBeVisible();
  expect(imageResponses.size, "reader should initially load the visible cover only").toBe(1);

  const audio = page.locator('[data-narration-audio="true"]');
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p0"));
  await expect.poll(() => audioRequests.some((path) => isNarrationAudioPath(path, storyId, "p0")), { timeout: 5_000 }).toBeTruthy();
  expect(
    audioRequests.every((path) => isNarrationAudioPath(path, storyId, "p0")),
    "opening a story must only request the cover narration",
  ).toBeTruthy();

  await audio.evaluate((element) => element.dispatchEvent(new Event("ended")));
  await expect(page.getByText("2 / 9", { exact: true })).toBeVisible();
  await expect.poll(() => audio.getAttribute("src")).toMatch(narrationPageSrcRe(storyId, "p1"));
  await expect.poll(() => imageResponses.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  expect(
    audioRequests.some((path) => isNarrationAudioPath(path, storyId, "p1")),
    "finishing a page should load the next narration item",
  ).toBeTruthy();
  expect(
    audioRequests.some((path) => isNarrationAudioPath(path, storyId, "p2")),
    "autoplay must not prefetch later pages",
  ).toBeFalsy();

  console.log(`[reader-media-baseline] ${testInfo.project.name}: images=${imageResponses.size}, audioRequests=${audioRequests.length}`);
});
