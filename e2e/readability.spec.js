import { test, expect } from '@playwright/test'
for (const width of [375, 768, 1440]) {
  for (const role of ['public', 'admin', 'employee']) {
    test(`${role} text sizes and themes at ${width}px`, async ({ page }) => {
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      await page.setViewportSize({ width, height: 1000 })
      await page.route('**/api/v1/**', route => {
        const url = route.request().url()
        const data = url.includes('auth/token/refresh') ? {access:'test-token', role} : url.includes('unread-count') ? {count:0} : []
        return route.fulfill({json:data})
      })
      await page.goto(role === 'public' ? '/' : `/${role}`)
      await expect(page.locator('h1').first()).toBeVisible()
      for (const mode of ['compact', 'normal', 'large']) {
        await page.getByRole('radio', {name: {compact:'کوچک',normal:'معمولی',large:'بزرگ'}[mode]}).check()
        await page.reload()
        await expect(page.locator('html')).toHaveAttribute('data-text-size', mode)
        for (const theme of ['dark', 'light']) {
          await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
          await expect(page.locator('h1').first()).toBeVisible()
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
          expect(overflow, `${role} ${mode} ${theme} at ${width}`).toBe(false)
        }
      }
      expect(errors).toEqual([])
      await page.screenshot({ path: `/tmp/baharnaj-${role}-${width}.png`, fullPage: true })
    })
  }
}
for (const width of [375, 768, 1440]) {
  test(`content and panel pages in large mode at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:1000})
    let role='public'
    await page.addInitScript(() => {localStorage.setItem('baharnaj-text-size','large');localStorage.setItem('baharnaj-theme','dark')})
    await page.route('**/api/v1/**', route => {
      const url=route.request().url()
      const data=url.includes('auth/token/refresh') ? {access:'test-token',role} : url.includes('unread-count') ? {count:0} : []
      return route.fulfill({json:data})
    })
    for (const path of ['/book','/services','/blog','/terms','/privacy','/admin/appointments','/admin/finance','/employee/calendar','/employee/earnings']) {
      role=path.startsWith('/admin') ? 'admin' : path.startsWith('/employee') ? 'employee' : 'public'
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true)
      if (path==='/admin/appointments') {
        const create=page.getByRole('button',{name:/افزودن نوبت/})
        {
          await create.first().click()
          await expect(page.locator('.admin-modal')).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true)
        }
      }
    }
  })
}
