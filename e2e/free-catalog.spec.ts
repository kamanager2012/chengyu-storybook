import { expect, test } from "@playwright/test";

// 叶公好龙 was behind the retired 19.9/year read gate; it must open for everyone now.
const FORMERLY_LOCKED_ID = "ye-gong";

test("whole catalog is free: no locks, no price, formerly paid story opens in both halls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  for (const hall of ["child", "classic"] as const) {
    await page.goto(`/hall/${hall}`, { waitUntil: "networkidle" });
    await expect(page.locator(`[data-shelf-hall="${hall}"] a[href*="/story/"]`)).toHaveCount(100);
    await expect(page.locator("[data-locked-story]")).toHaveCount(0);
    await expect(page.getByText(/元\s*\/\s*年/)).toHaveCount(0);
    await expect(page.locator('a[href*="/unlock"]')).toHaveCount(0);
    await page.goto(`/story/${FORMERLY_LOCKED_ID}?hall=${hall}`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-illustrated-story="true"]')).toBeVisible();
  }
});
