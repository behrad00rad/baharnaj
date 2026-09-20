import { test, expect } from '@playwright/test'

test('guest can reach booking wizard and see service selection', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/book')
  await expect(page.getByText('سرویس\u200cت را انتخاب کن.')).toBeVisible()
})
