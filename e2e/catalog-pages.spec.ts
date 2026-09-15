import { expect, test } from "@playwright/test";

test("about, privacy and unlock stay commercial without a fake checkout", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "成语故事", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "关于", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "隐私", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "关于", exact: true }).click();
  await expect(page.getByRole("heading", { name: "给小朋友的有声绘本馆", exact: true })).toBeVisible();
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("Created with Grok");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("有 11 本也是 Grok Imagine");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("其余 65 本是后来的重绘");
  await expect(page.locator('[data-grok-attribution="true"]')).toContainText("作为独立一类纳入发行权清单");

  await page.goto("/privacy", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "隐私说明", exact: true })).toBeVisible();
  await expect(page.getByText("不强制注册")).toBeVisible();
  await expect(page.getByText("11 本儿童馆 Grok 重绘")).toBeVisible();
  await expect(page.getByText("作为独立一类纳入发行权清单")).toBeVisible();
  await expect(page.getByText("生成方式本身不是发行许可")).toBeVisible();

  await page.goto("/unlock", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /开通全部 100 本/ })).toBeVisible();
  await expect(page.locator('[data-pay-pending="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /微信扫码支付|微信支付/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /支付宝扫码支付|支付宝/ })).toHaveCount(0);
});
