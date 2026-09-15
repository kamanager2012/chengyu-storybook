import { expect, test } from "@playwright/test";
import { STORY_HREF_RE, storyIdFromHref } from "./story-href";

test("promoted Imagine books use official public/stories media and gated narration", async ({ page }) => {
  const forbiddenDraftRequests: string[] = [];
  let storyId = "";

  page.on("request", (request) => {
    if (!storyId) return;
    const url = new URL(request.url());
    if (url.pathname.startsWith(`/draft-stories/${storyId}/`)) {
      forbiddenDraftRequests.push(url.pathname);
    }
  });

  await page.goto("/hall/child", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem(
      "chengyu.entitlement.v1",
      JSON.stringify({
        schemaVersion: 1,
        productId: "chengyu-storybook-annual-v1",
        grantedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  const mediaLinks = page.locator('a[data-media-story="true"]');
  const textLinks = page.locator('a[data-text-story="true"]');
  expect(await mediaLinks.count()).toBe(100);
  expect(await textLinks.count()).toBe(0);
  expect(await page.locator('a[href^="/story/"]').count()).toBe(100);

  const promotedStory = mediaLinks.nth(59);
  const href = await promotedStory.getAttribute("href");
  expect(href).toMatch(STORY_HREF_RE);
  storyId = storyIdFromHref(href!);

  await promotedStory.click();
  await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  await expect(page.locator('[data-narration-ready="true"]')).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByLabel("页码").getByRole("button")).toHaveCount(9);
  await expect(page.getByText("1 / 9", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();

  const heroImage = page.locator(".book-stage img").first();
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();
  await expect(heroImage).toHaveAttribute("src", new RegExp(`/stories/${storyId}/cover\\.jpg`));

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("2 / 9", { exact: true })).toBeVisible();

  await page.getByLabel("页码").getByRole("button").last().click();
  await expect(page.getByText("9 / 9", { exact: true })).toBeVisible();
  await expect(page.getByText("成语的意思", { exact: true })).toBeVisible();
  await expect(page.getByText("小道理", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "回书架", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /播放旁白|暂停旁白/ })).toBeVisible();

  const audio = page.locator('[data-narration-audio="true"]');
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.getAttribute("src")).toMatch(new RegExp(`/audio/${storyId}/moral\\.mp3`));
  expect(forbiddenDraftRequests, "promoted book attempted to load retired draft-stories media").toEqual([]);
});
