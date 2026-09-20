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
