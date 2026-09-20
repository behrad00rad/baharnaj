import { expect, test } from "@playwright/test";

test("login choice exposes customer and staff entry points", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: /ورود مشتری/ })).toHaveAttribute("href", "/account/login");
  await expect(page.getByRole("link", { name: /ورود کارکنان/ })).toHaveAttribute("href", "/staff/login");
});

test("customer dashboard is appointment-first and mobile responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/token/refresh/")) {
      await route.fulfill({ json: { access: "customer-token", role: "customer" } });
      return;
    }
    if (path.endsWith("/customer/dashboard/")) {
      await route.fulfill({ json: {
        customer: { display_name: "سارا" },
        next_appointment: null,
        unread_notification_count: 2,
        upcoming_count: 1,
        recent_history_count: 7,
      } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "سلام، سارا" })).toBeVisible();
  await expect(page.getByText("هنوز نوبت آینده‌ای ندارید")).toBeVisible();
  await expect(page.getByText("۷")).toBeVisible();
  await expect(page.getByLabel("منوی حساب مشتری")).toHaveCSS("position", "fixed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
