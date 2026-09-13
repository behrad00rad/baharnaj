import { test, expect } from '@playwright/test'
const service={id:1,slug:'nails',name:'Nails',persian_name:'مانیکور',category_name:'ناخن',category:1,price:450000,duration:60,short_description:'فرم و رنگ به انتخاب تو.',description:'مراقبت از ناخن و انتخاب رنگ مناسب.',images:[],employees:[]}
const employee={id:1,name:'سارا',full_name:'سارا',specialty:'ناخن',is_active:true,services:[service]}
const series=[{date:'۱۴۰۵/۰۶/۱۵',revenue:800000,commission:160000},{date:'۱۴۰۵/۰۶/۱۶',revenue:1200000,commission:240000}]
const finance={received:2000000,net_revenue:1800000,commission_total:400000,completed_services:4,payments_count:3,series,services:[{id:1,name:'مانیکور',revenue:2000000,share:100,paid_services:4}],employees:[{id:1,name:'سارا',revenue:2000000,commission:400000}],payments:[],transactions:[],appointments:[],services_performed:[]}
const post={id:1,slug:'care',title:'مراقبت از ناخن',excerpt:'چند نکته برای مراقبت روزانه.',content:[{type:'paragraph',text:'برای مراقبت روزانه از ناخن‌ها وقت بگذار.'}],published_at:'2026-09-07T09:00:00Z',category:{name:'مراقبت'},tags:[],related_posts:[],related_services:[]}
async function mock(page, role) {
 await page.route('**/api/v1/**', route => {
  const path=new URL(route.request().url()).pathname.replace('/api/v1/','')
  let data=[]
  if(path==='auth/token/refresh/') data={access:'test',role}
  else if(path==='services/nails/') data=service
  else if(path==='services/') data=[service]
  else if(path.includes('categories')) data=[]
  else if(path==='blog/posts/care/') data=post
  else if(path==='blog/posts/') data={results:[post],count:1}
  else if(path==='employees/' || path==='admin/employees/') data=[employee]
  else if(path.includes('revenue') || path.includes('earnings') || path.includes('finance')) data=finance
  else if(path.includes('unread-count')) data={count:0}
  return route.fulfill({json:data})
 })
}
const routes=['/','/services','/services/nails','/blog','/blog/care','/book','/gallery','/team','/about','/contact','/terms','/privacy','/login','/admin/appointments','/admin/finance','/employee/calendar','/employee/earnings','/employee/appointments/new']
for(const width of [360,390,768,1024,1440]) for(const theme of ['light','dark']) {
 test(`${theme} visual surfaces at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:950})
  await page.addInitScript(theme=>{localStorage.setItem('baharnaj-theme',theme)},theme)
  for(const path of routes){
   await page.unroute('**/api/v1/**');await mock(page,path.startsWith('/admin')?'admin':path.startsWith('/employee')?'employee':'public')
   await page.goto(path)
   await expect(page.locator('h1').first()).toBeVisible()
   await page.evaluate(()=>document.fonts.ready)
   if(!process.env.THEME_BEFORE) expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path).toBe(true)
   if((width===390||width===1440)&&['/','/book','/admin/finance','/employee/earnings'].includes(path)){
    if(path==='/book') await page.locator('.service-choice-grid button').first().click()
    await page.screenshot({animations:'disabled',path:`/tmp/theme-${process.env.THEME_BEFORE?'before':'after'}-${theme}-${width}-${path.replaceAll('/','_')||'home'}.png`,fullPage:true})
   }
  }
 })
}
test('footer preferences, chart tooltips and modals', async({page})=>{
 await page.setViewportSize({width:390,height:950})
 for(const theme of ['light','dark']){
  await page.addInitScript(theme=>localStorage.setItem('baharnaj-theme',theme),theme)
  await page.unroute('**/api/v1/**');await mock(page,'admin')
  await page.goto('/admin/finance')
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await page.locator('.recharts-bar-rectangle').first().hover()
  await expect(page.locator('.recharts-default-tooltip').first()).toBeVisible()
  await page.screenshot({animations:'disabled',path:`/tmp/theme-tooltip-${theme}.png`})
  await page.locator('.finance-employee-card').first().click()
  await expect(page.locator('.employee-finance-modal')).toBeVisible()
  await page.screenshot({animations:'disabled',path:`/tmp/theme-modal-${theme}.png`})
  await page.goto('/admin/appointments')
  await page.getByRole('button',{name:/افزودن نوبت/}).click()
  await expect(page.locator('.admin-modal')).toBeVisible()
  await page.locator('[data-jdp]').first().click()
  await expect(page.locator('jdp-container')).toBeVisible()
  await page.screenshot({animations:'disabled',path:`/tmp/theme-picker-${theme}.png`})
  await page.goto('/admin/finance')
  for(const [name,mode] of [['کوچک','compact'],['بزرگ','large'],['معمولی','normal']]){
   await page.getByRole('radio',{name}).check()
   await page.reload()
   await expect(page.locator('html')).toHaveAttribute('data-text-size',mode)
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
   await expect(page.getByRole('radio',{name})).toBeChecked()
  }
 }
})
