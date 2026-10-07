import { expect, test } from "@playwright/test";

const FREE_ID = "shou-zhu";
const LOCKED_ID = "ye-gong";

test.describe("read gate (12 free / annual unlock)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("chengyu.entitlement.v1");
    });
  });

  test("without entitlement: free story opens, locked story shows paywall", async ({ page }) => {
    await page.goto(`/story/${FREE_ID}?hall=child`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();

    await page.goto(`/story/${LOCKED_ID}?hall=child`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "叶公好龙", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看全年册" })).toBeVisible();
    await expect(page.locator('[data-illustrated-story="true"]')).toHaveCount(0);
  });

  test("with active entitlement: locked story opens reader", async ({ page }) => {
    await page.goto("/hall/child", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem(
        "chengyu.entitlement.v1",
        JSON.stringify({
          schemaVersion: 1,
          productId: "chengyu-storybook-annual-v1",
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
          source: "pay-claim",
        }),
      );
    });

    await page.goto(`/story/${LOCKED_ID}?hall=child`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  });

  test("shelf marks locked cards when gate is on", async ({ page }) => {
    await page.goto("/hall/child", { waitUntil: "networkidle" });
    const locked = page.locator('a[data-locked-story="true"]');
    await expect(locked.first()).toBeVisible();
    expect(await locked.count()).toBeGreaterThan(80);
  });
});
