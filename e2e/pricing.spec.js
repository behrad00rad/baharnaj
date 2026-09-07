import {test,expect} from '@playwright/test'
const modes=['FIXED','STARTING_FROM','RANGE','CONSULTATION','VARIABLE']
const services=modes.map((mode,index)=>({id:index+1,name:mode,persian_name:['مانیکور','رنگ مو','میکاپ','کراتین','رنگ و لایت'][index],slug:mode.toLowerCase(),category:1,category_name:'زیبایی',pricing_type:mode,price:mode==='FIXED'?450000:0,minimum_price:['STARTING_FROM','RANGE'].includes(mode)?2000000:null,maximum_price:mode==='RANGE'?3000000:null,pricing_note:mode==='VARIABLE'?'بر اساس قد و حجم مو':'',duration:60,is_active:true,is_bookable:true,images:[],employees:[]}))
for(const width of [390,768,1366]) for(const theme of ['light','dark']) test(`${theme} service pricing at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950})
 await page.addInitScript(theme=>localStorage.setItem('baharnaj-theme',theme),theme)
 let role='public'
 await page.route('**/api/v1/**',route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname.includes('auth/token/refresh'))data={access:'test',role}
  else if(url.pathname.includes('service-categories'))data=[{id:1,name:'زیبایی'}]
  else if(url.pathname.endsWith('/services/'))data=services
  else if(url.pathname.includes('/services/'))data=services.find(service=>url.pathname.endsWith(`/${service.slug}/`))||services[0]
  else if(url.pathname.includes('unread-count'))data={count:0}
  return route.fulfill({json:data})
 })
 await page.goto('/services')
 await expect(page.getByText('قیمت پس از مشاوره').first()).toBeVisible()
 await expect(page.getByText('قیمت متغیر').first()).toBeVisible()
 await page.goto('/services/variable')
 await expect(page.locator('.pricing-note')).toContainText('بر اساس قد و حجم مو')
 await page.goto('/book')
 await page.locator('.service-choice-grid button').filter({hasText:'مانیکور'}).click()
 await page.locator('.service-choice-grid button').filter({hasText:'کراتین'}).click()
 await expect(page.locator('.wizard-aside')).toContainText('مبلغ قطعی خدمات ثابت: ۴۵۰٬۰۰۰ تومان')
 await expect(page.locator('.wizard-aside')).toContainText('پس از مشاوره')
 role='admin';await page.goto('/admin/services')
 await page.getByRole('button',{name:/افزودن سرویس/}).click()
 for(const mode of modes){
  await page.getByLabel('نوع قیمت').selectOption(mode)
  if(mode==='RANGE')await expect(page.getByLabel('حداکثر قیمت (تومان)')).toBeVisible()
  if(mode==='CONSULTATION')await expect(page.getByLabel('حداقل قیمت (تومان)')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
 }
 await page.getByLabel('نوع قیمت').scrollIntoViewIfNeeded()
 await page.screenshot({path:`/tmp/pricing-${theme}-${width}.png`})
})
test('admin and employee can finalize from the appointment detail',async({page})=>{
 await page.setViewportSize({width:390,height:950})
 await page.addInitScript(()=>localStorage.setItem('baharnaj-theme','dark'))
 for(const role of ['admin','employee']){
  const item={id:1,service:2,service_name:'رنگ مو',employee:1,employee_name:'سارا',date:'2026-09-14',start_time:'09:00',end_time:'10:00',duration_snapshot:60,price_snapshot:2000000,pricing_type:'STARTING_FROM',catalog_pricing_snapshot:{pricing_type:'STARTING_FROM',minimum_price:2000000},is_price_final:false,price_status:'estimated',completion_status:'pending',notes:''}
  const appointment={id:1,customer_name:'مشتری',customer_phone:'09112223344',items:[item],status:'pending',payment_status:'unpaid',has_unresolved_prices:true,appointment_total:0,remaining_total:0,payments:[],status_history:[]}
  let submitted
  await page.unroute('**/api/v1/**')
  await page.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url());let data=[]
   if(url.pathname.includes('auth/token/refresh'))data={access:'test',role}
   else if(url.pathname.endsWith('final-price/')) {submitted=route.request().postDataJSON();data={...item,...submitted,is_price_final:true}}
   else if(url.pathname.endsWith('/appointments/1/'))data=appointment
   else if(url.pathname.endsWith('/appointments/'))data=[appointment]
   else if(url.pathname.includes('/payments/'))data={payments:[],has_unresolved_prices:true}
   else if(url.pathname.includes('unread-count'))data={count:0}
   return route.fulfill({json:data})
  })
  await page.goto(role==='admin'?'/admin/appointments?appointment=1':'/employee/calendar?appointment=1')
  const price=page.getByLabel('قیمت نهایی توافق‌شده (تومان)')
  await expect(price).toBeVisible()
  await price.fill('3850000')
  await page.locator('.item-pricing').scrollIntoViewIfNeeded()
  await page.screenshot({path:`/tmp/pricing-final-${role}.png`})
  await page.getByRole('button',{name:'ذخیره قیمت'}).click()
  await expect.poll(()=>submitted?.final_price).toBe(3850000)
 }
})
