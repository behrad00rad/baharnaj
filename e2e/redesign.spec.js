import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// Explicitly synthetic media checks layout only; never published as salon work.
const media = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#d6c2b2"/><path d="M0 700L800 200V1000H0Z" fill="#8c7467"/><text x="90" y="180" font-size="44" fill="#202723">QA media fixture</text></svg>')
const services = [1,2].map(id => ({id, slug:`service-${id}`, name:`خدمت ${id}`, persian_name:id === 1 ? 'رنگ مو' : 'کوتاهی', category_name:'مو', pricing_type:'STARTING_FROM', minimum_price:450000, price:450000, duration:60, short_description:'توضیحات آزمایشی خدمات برای بررسی نمایش متن فارسی.', description:'متن آزمایشی بلند برای بررسی صفحهٔ جزئیات.\nجزئیات خدمات از سامانهٔ مدیریت محتوا دریافت می‌شود.', images:[{id,image_url:media}], employees:[{id:7,name:'متخصص آزمایشی'}], seo_title:'عنوان اختصاصی مدیریت محتوا'}))
const gallery = [1,2,3].map(id => ({id, title:`تصویر آزمایشی ${id}`, category:id === 3 ? 'ناخن' : 'مو', image_url:media}))
async function mock(page, {empty=false, error=false}={}) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/','')
    let data=[]
    if(path === 'auth/token/refresh/') return route.fulfill({status:401,json:{}})
    if(path === 'services/') data=services
    if(path.startsWith('services/service-')) data=services[0]
    if(path === 'employees/') data=[{id:7,name:'متخصص آزمایشی',specialty:'مو',services}]
    if(path === 'gallery/') {
      if(error) return route.fulfill({status:503,json:{}})
      data=empty?[]:gallery
    }
    if(path === 'gallery/categories/') data=[{id:1,name:'مو'},{id:2,name:'ناخن'},{id:3,name:'آرایش'}]
    if(path.includes('availability')) data={slots:['10:00','12:00']}
    if(path === 'booking-holds/') data={token:'local-test-hold',expires_at:'2099-01-01T00:00:00Z'}
    return route.fulfill({json:data})
  })
}
for(const theme of ['light','dark']) {
 test(`${theme}: menu keyboard, gallery filters, focus restoration and font`,async({page})=>{
  await page.setViewportSize({width:390,height:850})
  await page.addInitScript(theme=>{if(!localStorage.getItem('baharnaj-theme')) localStorage.setItem('baharnaj-theme',theme)},theme)
  await mock(page);await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  await page.evaluate(()=>document.fonts.load('16px Vazirmatn'))
  expect(await page.evaluate(()=>document.fonts.check('16px Vazirmatn'))).toBe(true)
  await expect(page.locator('.hero-image img')).toHaveAttribute('loading','eager')
  await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-390-home.png`,fullPage:true})
  const menu=page.getByRole('button',{name:'باز کردن منو'})
  await menu.click()
  await expect(page.getByRole('button',{name:'بستن منو ×'})).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.mobile-nav-actions a').last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('')
  await menu.click();await page.locator('#mobile-navigation').getByRole('link',{name:/نمونه‌کارها/}).click()
  await expect(page).toHaveURL(/gallery/)
  await expect(menu).toHaveAttribute('aria-expanded','false')
  await page.getByRole('button',{name:'ناخن',exact:true}).click()
  await expect(page.locator('.gallery-card')).toHaveCount(1)
  await expect(page.getByRole('button',{name:'ناخن',exact:true})).toHaveAttribute('aria-pressed','true')
  const card=page.locator('.gallery-card');await card.click()
  await expect(page.getByRole('button',{name:'بستن',exact:true})).toBeFocused()
  await page.keyboard.press('Escape');await expect(card).toBeFocused()
  await page.getByRole('button',{name:'آرایش',exact:true}).click()
  await expect(page.getByText('در این دسته تصویری ثبت نشده است.')).toBeVisible()
  await page.getByRole('button',{name:'همه',exact:true}).click()
  await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-390-gallery.png`,fullPage:true})
  await page.setViewportSize({width:1440,height:950});await page.goto('/')
  await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-1440-home.png`,fullPage:true})
  await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-1440-hero.png`})
  await page.getByRole('button',{name:theme==='light'?'فعال‌کردن حالت تاریک':'فعال‌کردن حالت روشن'}).click()
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='light'?'dark':'light')
 })
 test(`${theme}: enlarged text, reduced motion, CMS titles, deep links and multi-service back state`,async({page})=>{
  await page.setViewportSize({width:768,height:950})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.addInitScript(theme=>{if(!localStorage.getItem('baharnaj-theme')) localStorage.setItem('baharnaj-theme',theme)},theme)
  await mock(page);await page.goto('/services/service-1');await page.reload()
  await expect(page).toHaveTitle('عنوان اختصاصی مدیریت محتوا')
  await page.locator('.detail-actions .button').click()
  await expect(page).toHaveURL(/book\?service=1/)
  await expect(page.locator('.employee-choice-grid button')).toBeVisible()
  await page.getByRole('button',{name:/بازگشت/}).click()
  await expect(page.locator('.service-choice-grid button.selected')).toHaveCount(1)
  await page.locator('.service-choice-grid button').last().click()
  await page.getByRole('button',{name:/انتخاب متخصص/}).click()
  await page.getByRole('button',{name:/بازگشت/}).click()
  await expect(page.locator('.service-choice-grid button.selected')).toHaveCount(2)
  for(const path of ['/','/services','/services/service-1','/book','/gallery','/about','/contact','/privacy','/login']) {
   await page.goto(path);await expect(page.locator('h1').first()).toBeVisible()
   await page.evaluate(()=>document.fonts.ready)
   await page.evaluate(()=>document.documentElement.style.fontSize='200%')
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path).toBe(true)
   const clipped=await page.locator('#public-content h1').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+2).length)
   expect(clipped,path).toBe(0)
  }
  await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-200pct.png`,fullPage:true})
 })
}
test('empty and unavailable gallery degrade without invented homepage imagery',async({page})=>{
 await mock(page,{empty:true});await page.goto('/')
 await expect(page.locator('.hero-no-media')).toBeVisible();await expect(page.locator('.hero-image')).toHaveCount(0)
 await page.goto('/gallery');await expect(page.getByText('هنوز تصویری برای نمایش ثبت نشده است.')).toBeVisible()
 await page.unroute('**/api/v1/**');await mock(page,{error:true});await page.reload()
 await expect(page.getByText('دریافت تصاویر گالری ممکن نیست. لطفاً دوباره تلاش کنید.')).toBeVisible()
})

test('measured text, action and interactive-boundary contrast in both themes', async({page})=>{
 await mock(page)
 const report={}
 for(const theme of ['light','dark']) {
  await page.goto('/login');await expect(page.locator('h1')).toBeVisible()
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
  const pairs=await page.evaluate(()=>{
   const css=getComputedStyle(document.documentElement)
   const rgb=token=>{const probe=document.createElement('span');probe.style.color=css.getPropertyValue('--color-'+token);document.body.append(probe);const color=getComputedStyle(probe).color.match(/[\d.]+/g).slice(0,3).map(Number);probe.remove();return color}
   const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
   return [
    ['text-primary','page-bg',4.5],['text-secondary','page-bg',4.5],['text-secondary','surface-subtle',4.5],
    ['field-text','field-bg',4.5],['field-placeholder','field-bg',4.5],['field-border','field-bg',3],['border-strong','page-bg',3],
    ['button-primary-text','button-primary-bg',4.5],['button-primary-text','button-primary-hover',4.5],
    ['brand-accent-text','brand-accent',4.5],['accent-muted','brand-accent',4.5],['home-about-text','home-about-bg',4.5],
    ['home-cta-text','home-cta-bg',4.5],['footer-muted','footer-bg',4.5],['focus','page-bg',3],
    ['error-text','error-bg',4.5],['warning-text','warning-bg',4.5],['success-text','success-bg',4.5],
   ].map(([fg,bg,target])=>{const a=luminance(rgb(fg)),b=luminance(rgb(bg));return{fg,bg,target,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})
  })
  report[theme]=pairs
  for(const pair of pairs) expect(pair.ratio,`${theme} ${pair.fg}/${pair.bg}`).toBeGreaterThanOrEqual(pair.target)
 }
 writeFileSync('/tmp/baharnaj-contrast.json',JSON.stringify(report,null,2))
 await test.info().attach('contrast-measurements.json',{body:JSON.stringify(report,null,2),contentType:'application/json'})
})

test('booking validates contact, keeps input after failure, blocks duplicate submits and reports pending status',async({page})=>{
 await mock(page)
 let submissions=0
 await page.route('**/api/v1/appointments/', async route=>{
  submissions++
  await new Promise(resolve=>setTimeout(resolve,300))
  if(submissions===1) return route.fulfill({status:503,json:{detail:'ثبت درخواست انجام نشد؛ دوباره تلاش کنید.'}})
  return route.fulfill({json:{status:'pending',confirmation_code:'LOCAL-QA',items:[]}})
 })
 await page.goto('/book?service=1')
 await page.locator('.employee-choice-grid button').click()
 await page.getByRole('button',{name:/انتخاب تاریخ و ساعت/}).click()
 await page.locator('.date-trigger').click()
 await expect(page.getByRole('button',{name:'بستن',exact:true})).toBeFocused()
 await page.keyboard.press('Escape')
 await expect(page.locator('.date-trigger')).toBeFocused()
 await page.locator('.date-trigger').click()
 await page.getByRole('textbox',{name:'تاریخ شمسی'}).fill('1406/01/20')
 await page.getByRole('button',{name:'10:00',exact:true}).click()
 await page.getByRole('button',{name:/ادامه/}).click()
 await page.getByRole('button',{name:/بررسی اطلاعات/}).click()
 await expect(page.getByRole('textbox',{name:'نام و نام خانوادگی'})).toBeFocused()
 await page.getByRole('textbox',{name:'نام و نام خانوادگی'}).fill('مشتری آزمایشی')
 await page.getByRole('textbox',{name:'شماره موبایل'}).fill('09121234567')
 await page.getByRole('button',{name:/بررسی اطلاعات/}).click()
 await page.getByRole('button',{name:/تأیید و ثبت نهایی رزرو/}).click()
 await expect(page.getByRole('button',{name:/در حال ثبت/})).toBeDisabled()
 await expect(page.getByRole('alert')).toHaveText('ثبت درخواست انجام نشد؛ دوباره تلاش کنید.')
 expect(submissions).toBe(1)
 await page.getByRole('button',{name:/بازگشت/}).click()
 await expect(page.getByRole('textbox',{name:'نام و نام خانوادگی'})).toHaveValue('مشتری آزمایشی')
 await page.getByRole('button',{name:/بررسی اطلاعات/}).click()
 await page.getByRole('button',{name:/تأیید و ثبت نهایی رزرو/}).click()
 await expect(page.getByRole('heading',{name:'درخواست نوبت دریافت شد.'})).toBeVisible()
 await expect(page.getByText('LOCAL-QA')).toBeVisible()
 expect(submissions).toBe(2)
})

for(const theme of ['light','dark']) test(`${theme}: populated media at every requested width`,async({page})=>{
 await mock(page)
 await page.addInitScript(theme=>localStorage.setItem('baharnaj-theme',theme),theme)
 for(const width of [360,390,768,1024,1440]) {
  await page.setViewportSize({width,height:950})
  for(const path of ['/','/gallery','/services/service-1']) {
   await page.goto(path);await expect(page.locator('h1')).toBeVisible()
   await page.evaluate(()=>document.fonts.ready)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} ${width}`).toBe(true)
   const images=page.locator('#public-content img')
   expect(await images.evaluateAll(nodes=>nodes.every(img=>img.complete && img.naturalWidth>0))).toBe(true)
   if(path==='/services/service-1' && [390,1440].includes(width)) await page.screenshot({animations:'disabled',path:`/tmp/redesign-${theme}-${width}-service.png`,fullPage:true})
  }
 }
})
