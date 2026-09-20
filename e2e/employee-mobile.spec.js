import { expect, test } from "@playwright/test";

test("employee dashboard keeps a compact mobile workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/token/refresh/")) {
      await route.fulfill({ json: { access: "employee-token", role: "employee" } });
      return;
    }
    if (path.endsWith("/employee/statistics/")) {
      await route.fulfill({
        json: {
          today_total: 2,
          completed_services: 1,
          remaining_services: 1,
          employee_commission: 1250000,
          next_appointment: { id: 1, customer_name: "سارا احمدی" },
          next_appointment_item: {
            service_name: "رنگ و لایت",
            duration_snapshot: 90,
            start_time: "14:30",
          },
        },
      });
      return;
    }
    if (path.includes("/employee/appointments/")) {
      await route.fulfill({
        json: [
          {
            id: 1,
            customer_name: "سارا احمدی",
            status: "confirmed",
            items: [{ service_name: "رنگ و لایت", start_time: "14:30", end_time: "16:00" }],
          },
        ],
      });
      return;
    }
    if (path.endsWith("/notifications/unread-count/")) {
      await route.fulfill({ json: { count: 2 } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/employee/");
  const navigation = page.getByLabel("منوی پنل متخصص");
  await expect(page.getByRole("heading", { name: "امروز", exact: true })).toBeVisible();
  await expect(page.getByText("سارا احمدی").first()).toBeVisible();
  await expect(navigation).toHaveCSS("display", "grid");
  await expect(navigation).toHaveCSS("height", "72px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("employee calendar and appointment dialog stay compact on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/token/refresh/")) return route.fulfill({ json: { access: "employee-token", role: "employee" } });
    if (path.endsWith("/notifications/unread-count/")) return route.fulfill({ json: { count: 0 } });
    if (path.endsWith("/employee/appointments/") && route.request().method() === "GET") return route.fulfill({ json: [{ id: 7, customer_name: "مریم رضایی", customer_phone: "09120000000", status: "confirmed", items: [{ id: 19, date: today, service_name: "رنگ مو", start_time: "10:00", end_time: "11:00", completion_status: "scheduled" }] }] });
    if (path.includes("/employee/appointments/7/payments/")) return route.fulfill({ json: { paid_total: 0, remaining_total: 500000, reportable_total: 500000, pending_total: 0, payments: [] } });
    if (path.includes("/employee/appointment-items/19/action/")) return route.fulfill({ json: {} });
    await route.fulfill({ json: [] });
  });

  await page.goto("/employee/calendar");
  await expect(page.getByRole("heading", { name: "تقویم" })).toBeVisible();
  await expect(page.getByRole("button", { name: today })).toBeVisible();
  await page.getByRole("button", { name: /مریم رضایی.*رنگ مو/ }).click();
  const dialog = page.getByRole("dialog", { name: "مریم رضایی" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "بستن جزئیات نوبت" })).toBeVisible();
  await expect(dialog.getByText("تاریخ", { exact: true })).toBeVisible();
  await expect(dialog.getByText("مبلغ و پرداخت")).toBeVisible();
  await expect(dialog.locator("details").first()).not.toHaveAttribute("open", "");
  const box = await dialog.boundingBox();
  expect(box.height).toBeLessThanOrEqual(760);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
