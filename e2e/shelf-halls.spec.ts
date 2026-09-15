import { expect, test } from "@playwright/test";
import { STORY_HREF_RE } from "./story-href";

test("home chooses between two halls; each hall has its own 100-book shelf", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByText("3–8 岁亲子有声绘本")).toBeVisible();
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
  await expect(page.locator('a[data-hall-entrance="child"]')).toBeVisible();
  await expect(page.locator('a[data-hall-entrance="classic"]')).toBeVisible();
  await expect(page.locator('a[data-media-story="true"]')).toHaveCount(0);

  await page.locator('a[data-hall-entrance="child"]').click();
  await expect(page).toHaveURL(/\/hall\/child$/);
  await expect(page.getByRole("heading", { name: "儿童馆", exact: true }).first()).toBeVisible();
  const childLinks = page.locator('[data-shelf-hall="child"] a[data-media-story="true"]');
  await expect(childLinks).toHaveCount(100);
  await expect(childLinks.first()).toHaveAttribute("data-story-hall", "child");
  await expect(childLinks.first()).toHaveAttribute("href", /\/story\/shou-zhu\?hall=child$/);
  await expect(childLinks.first()).toHaveAttribute("href", STORY_HREF_RE);

  await page.getByRole("link", { name: "回选馆" }).click();
  await page.locator('a[data-hall-entrance="classic"]').click();
  await expect(page).toHaveURL(/\/hall\/classic$/);
  const classicLinks = page.locator('[data-shelf-hall="classic"] a[data-media-story="true"]');
  await expect(classicLinks).toHaveCount(100);
  await expect(classicLinks.first()).toHaveAttribute("data-story-hall", "classic");
  await expect(classicLinks.first()).toHaveAttribute("href", /\/story\/shou-zhu\?hall=classic$/);
});

test("the same idiom opens children's JPEGs in 儿童馆 and gongbi JPEGs in 古风馆", async ({ page }) => {
  await page.goto("/hall/child", { waitUntil: "networkidle" });

  await page.locator('[data-shelf-hall="child"] a[data-media-story="true"]').first().click();
  await expect(page.locator('[data-illustrated-story="true"]')).toHaveAttribute("data-story-hall", "child");
  await expect(page.locator(".book-stage img").first()).toHaveAttribute("src", /\/stories\/shou-zhu\/cover\.jpg$/);

  await page.getByRole("link", { name: "返回书架" }).click();
  await expect(page).toHaveURL(/\/hall\/child$/);
  await expect(page.getByRole("heading", { name: "儿童馆", exact: true }).first()).toBeVisible();

  await page.goto("/hall/classic", { waitUntil: "networkidle" });
  await page.locator('[data-shelf-hall="classic"] a[data-media-story="true"]').first().click();
  await expect(page.locator('[data-illustrated-story="true"]')).toHaveAttribute("data-story-hall", "classic");
  const hero = page.locator(".book-stage img").first();
  await expect(hero).toHaveAttribute("src", /\/classic-stories\/shou-zhu\/cover\.jpg$/);
  await expect(page.locator("[data-illustration-attribution=true]")).toHaveText("古风馆插图 · 工笔线");
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBeTruthy();
});

test("胸有成竹 children's Grok overlay is attributed; later Cursor redraws are not", async ({ page }) => {
  await page.goto("/hall/child", { waitUntil: "networkidle" });

  const childLink = page.locator('[data-shelf-hall="child"] a[href*="/story/xiong-you-cheng-zhu"]');
  await expect(childLink).toHaveAttribute("href", /\/story\/xiong-you-cheng-zhu\?hall=child$/);
  await childLink.click();
  await expect(page.locator('[data-illustrated-story="true"]')).toHaveAttribute("data-story-hall", "child");
  await expect(page.locator(".book-stage img").first()).toHaveAttribute("src", /\/child-stories\/xiong-you-cheng-zhu\/cover\.jpg$/);
  await expect(page.locator("[data-illustration-attribution=true]")).toHaveText("儿童馆插图 · Created with Grok");
  await expect(page.locator("[data-grok-attribution=true]")).toContainText("Created with Grok");

  await page.getByRole("link", { name: "返回书架" }).click();
  await page.goto("/hall/classic", { waitUntil: "networkidle" });
  await page.locator('[data-shelf-hall="classic"] a[href*="/story/xiong-you-cheng-zhu"]').click();
  await expect(page.locator('[data-illustrated-story="true"]')).toHaveAttribute("data-story-hall", "classic");
  await expect(page.locator(".book-stage img").first()).toHaveAttribute("src", /\/stories\/xiong-you-cheng-zhu\/cover\.jpg$/);

  await page.getByRole("link", { name: "返回书架" }).click();
  await page.goto("/hall/child", { waitUntil: "networkidle" });
  await page.locator('[data-shelf-hall="child"] a[href*="/story/po-fu-chen-zhou"]').click();
  await expect(page.locator('[data-illustrated-story="true"]')).toHaveAttribute("data-story-hall", "child");
  await expect(page.locator(".book-stage img").first()).toHaveAttribute("src", /\/child-stories\/po-fu-chen-zhou\/cover\.jpg$/);
  await expect(page.locator("[data-illustration-attribution=true]")).toHaveText("儿童馆插图 · AI 生成");
  await expect(page.locator("[data-grok-attribution=true]")).toHaveCount(0);
});
