import { expect, test } from "@playwright/test";

test("about and privacy pages state free access and the CC BY-NC-SA licence", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "关于", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "隐私", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "关于", exact: true }).click();
  await expect(page.getByRole("heading", { name: "成册翻页，两座馆", exact: true })).toBeVisible();
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("Created with Grok");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("有 11 本也是 Grok Imagine");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("其余 65 本是后来的重绘");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("古风馆里另有一套工笔画");
  await expect(page.getByText(/CC BY-NC-SA 4\.0/).first()).toBeVisible();
  await expect(page.getByText(/\bMIT\b/)).toHaveCount(0);

  await page.goto("/privacy", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "隐私说明", exact: true })).toBeVisible();
  await expect(page.getByText("无需注册或登录")).toBeVisible();
  await expect(page.getByText("11 本儿童馆 Grok 重绘")).toBeVisible();
  await expect(page.getByText("古风馆里另有一套工笔画")).toBeVisible();
  await expect(page.getByText("AI 生成本身不等于获得发行许可")).toBeVisible();
});
