import { test, expect } from '@playwright/test'
for (const width of [390, 1366]) for (const theme of ['light', 'dark']) test(`Telegram ${width} ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(theme => localStorage.setItem('baharnaj-theme', theme), theme)
  let role='admin', bookingPayload=null
  const config={reminder_hours:[24,3],marketing_start:10,marketing_end:20,cap_days:7,birthday_enabled:false,points_per_toman:0,points_expiry_days:365,reactivation_days:90,attribution_days:7,hours:'',instagram_url:'',map_url:'',support_url:'',birthday_gift:null}
  await page.route('**/api/v1/**', route => {
    const path=new URL(route.request().url()).pathname
    let data={results:[],next:null}
    if(path.includes('auth/token/refresh'))data={access:'mock',role}
    else if(path.includes('/telegram/admin/overview'))data={configured:false,dry_run:true,token_present:false,counts:{},linked:0,eligible:0,heartbeat:null,next_jobs:[],link_visits:0,attributed_bookings:0,attributed_completed:0}
    else if(path.includes('/telegram/admin/setup'))data={bot_username:'',site_url:'https://salon.example',backend_url:'https://api.example',mode:'off',token_present:false,secret_present:false,credentials_readable:true,revision:0}
    else if(path.includes('/telegram/admin/config'))data=config
    else if(path.includes('/telegram/customer/')) { if (route.request().method()==='POST') return route.fulfill({status:503,json:{detail:'اتصال تلگرام موقتاً در دسترس نیست.'}}); data={configured:true,connected:false,id:1,appointments:false,marketing:false} }
    else if(path.includes('/telegram/benefits/'))data={balance:0,benefits:[],rules:[],appointments:[]}
    else if(path.endsWith('/services/'))data=[{id:1,persian_name:'رنگ مو',name:'Color',duration:60,price:1000,pricing_type:'FIXED',is_bookable:true,category:1,category_name:'مو'},{id:2,persian_name:'کوتاهی',name:'Cut',duration:30,price:500,pricing_type:'FIXED',is_bookable:true,category:1,category_name:'مو'}]
    else if(path.includes('/employees/'))data=[{id:7,name:'متخصص بهارناژ'}]
    else if(path.includes('/availability/'))data={slots:['10:00']}
    else if(path.includes('/booking-holds/'))data={token:'held',expires_at:new Date(Date.now()+300000).toISOString()}
    else if(path.endsWith('/appointments/')) { bookingPayload=route.request().postDataJSON(); data={id:1,status:'pending',confirmation_code:'MOCK',telegram_receipt:'mock-receipt',items:bookingPayload.items.map((item,i)=>({...item,id:i+1,service_name:i===0?'رنگ مو':'کوتاهی'}))} }
    else if(path.includes('unread-count'))data={count:0}
    return route.fulfill({json:data})
  })
  await page.goto('/admin/telegram')
  await expect(page.getByRole('heading',{name:'تلگرام سالن'})).toBeVisible()
  for(const label of ['شروع','مشتریان','پیام به مشتریان','یادآوری‌ها','تنظیمات ربات']) {
    await page.locator('.telegram-tabs').getByRole('button',{name:label,exact:true}).click()
    await expect(page.locator('.telegram-tabs').getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  }
  await page.locator('.telegram-tabs').getByRole('button',{name:'پیام به مشتریان',exact:true}).click()
  await page.getByRole('button',{name:/نوشتن پیام/}).click()
  await page.screenshot({path:`/tmp/telegram-admin-${theme}-${width}.png`,fullPage:true})
  role='customer';await page.goto('/telegram')
  await expect(page.getByRole('heading',{name:'یادآوری نوبت در تلگرام'})).toBeVisible()
  await expect(page.getByLabel('مایلم پیشنهادها و تخفیف‌های بهارناژ را هم دریافت کنم.')).not.toBeChecked()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.screenshot({path:`/tmp/telegram-customer-${theme}-${width}.png`,fullPage:true})
  role=null;await page.goto('/book?tg_campaign=opaque-test-attribution')
  await page.locator('.service-choice-grid button').filter({hasText:'رنگ مو'}).click()
  await page.locator('.service-choice-grid button').filter({hasText:'کوتاهی'}).click()
  await page.getByRole('button',{name:/انتخاب متخصص/}).click()
  await page.locator('.employee-choice-grid button').nth(0).click()
  await page.locator('.employee-choice-grid button').nth(1).click()
  await page.getByRole('button',{name:/انتخاب تاریخ و ساعت/}).click()
  await page.locator('.date-trigger').click()
  await page.getByLabel('تاریخ شمسی').fill('1406/01/15')
  await page.getByRole('button',{name:'10:00',exact:true}).click()
  await page.getByRole('button',{name:/^ادامه/}).click()
  await page.getByLabel('نام و نام خانوادگی').fill('مشتری آزمایشی')
  await page.getByLabel('شماره موبایل').fill('09123456789')
  await page.getByRole('button',{name:/بررسی اطلاعات/}).click()
  await page.getByRole('button',{name:/ثبت نهایی رزرو/}).click()
  await expect(page.getByRole('heading',{name:'درخواست نوبت دریافت شد.'})).toBeVisible()
  expect(bookingPayload.items).toHaveLength(2)
  expect(bookingPayload.tg_campaign).toBe('opaque-test-attribution')
  await expect(page.getByLabel('مایلم پیشنهادها و تخفیف‌های بهارناژ را هم دریافت کنم.')).not.toBeChecked()
  await page.getByRole('button',{name:'اتصال به تلگرام',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('موقتاً در دسترس نیست')
  await expect(page.getByRole('heading',{name:'درخواست نوبت دریافت شد.'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.screenshot({path:`/tmp/telegram-booking-${theme}-${width}.png`,fullPage:true})
})

for (const width of [390,1366]) for (const theme of ['light','dark']) test(`Guided Telegram admin ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:900})
  await page.addInitScript(theme=>localStorage.setItem('baharnaj-theme',theme),theme)
  let setup={bot_username:'',site_url:'https://salon.example',backend_url:'https://api.example',mode:'off',token_present:false,secret_present:false,credentials_readable:true,revision:0,verified_at:null}
  let credentialSubmission=null, scheduled=null, campaign=null
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method()
    let data={results:[],next:null}
    if(path.includes('auth/token/refresh'))data={access:'mock',role:'admin'}
    else if(path.includes('/telegram/admin/setup')){
      if(method==='PATCH'){
        const body=route.request().postDataJSON();credentialSubmission=body
        setup={...setup,bot_username:body.bot_username||setup.bot_username,token_present:!!body.token||setup.token_present,secret_present:!!body.integration_secret||setup.secret_present,revision:setup.revision+1}
      } else if(method==='POST')setup={...setup,bot_username:'SalonFixtureBot',verified_at:new Date().toISOString(),revision:setup.revision+1}
      data=setup
    } else if(path.includes('/telegram/admin/overview'))data={configured:false,dry_run:true,linked:0,eligible:0,counts:{},next_jobs:[]}
    else if(path.endsWith('/campaigns/')&&method==='POST'){campaign={...route.request().postDataJSON(),id:11,revision:1};data=campaign}
    else if(path.endsWith('/campaigns/11/preview/'))data={text:campaign.text,total:4,reachable:3,eligible:2,exclusions:{no_consent:1},scheduled_at:campaign.scheduled_at,revision:1}
    else if(path.endsWith('/campaigns/11/schedule/')){scheduled=route.request().postDataJSON();data={status:'queued'}}
    else if(path.endsWith('/services/'))data=[]
    else if(path.includes('unread-count'))data={count:0}
    return route.fulfill({json:data})
  })
  await page.goto('/admin/telegram')
  await expect(page.getByRole('button',{name:'راه‌اندازی ربات'})).toBeVisible()
  await page.screenshot({path:`/tmp/telegram-start-${theme}-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'راه‌اندازی ربات'}).click()
  await expect(page.getByRole('button',{name:'ذخیره اطلاعات ربات'})).toBeVisible()
  const token=page.getByLabel(/توکن ربات/)
  await token.fill('123456:'+'x'.repeat(35))
  await page.getByRole('button',{name:'ساخت رمز اتصال'}).click()
  await page.getByRole('button',{name:'ذخیره اطلاعات ربات'}).click()
  await expect(token).toHaveValue('')
  expect(credentialSubmission.token).toBe('123456:'+'x'.repeat(35))
  expect(credentialSubmission.integration_secret).toHaveLength(64)
  expect(credentialSubmission).not.toHaveProperty('mode')
  await page.getByRole('button',{name:'بررسی توکن'}).click()
  await expect(page.getByText('✓ توکن بررسی شده است')).toBeVisible()
  await page.screenshot({path:`/tmp/telegram-setup-${theme}-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'راهنمای راه‌اندازی'}).click()
  await expect(page.getByRole('heading',{name:'از کجا شروع کنم؟'})).toBeVisible()
  await page.screenshot({path:`/tmp/telegram-guide-${theme}-${width}.png`,fullPage:true})
  await page.locator('.telegram-tabs').getByRole('button',{name:'پیام به مشتریان',exact:true}).click()
  await page.getByRole('button',{name:/نوشتن پیام/}).click()
  await page.getByLabel('متن پیام').fill('برای دیدن زمان‌های خالی، دکمه رزرو را بزنید.')
  await page.getByRole('button',{name:/بعدی: انتخاب مشتریان/}).click()
  await page.getByRole('button',{name:/بعدی: بررسی پیام/}).click()
  await expect(page.getByText('۲ مشتری آماده دریافت این پیام')).toBeVisible()
  await expect(page.getByRole('button',{name:'تأیید و قرار دادن در صف'})).toBeDisabled()
  expect(scheduled).toBeNull()
  await page.getByRole('checkbox',{name:/متن و زمان را بررسی کردم/}).check()
  await page.getByRole('button',{name:'تأیید و قرار دادن در صف'}).click()
  await expect(page.getByText(/پیام در صف قرار گرفت/)).toBeVisible()
  expect(scheduled).toEqual({confirm:true,recipient_count:2,revision:1})
  expect(errors).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})
