import {test,expect} from '@playwright/test';
for(const width of [390,1366]) for(const theme of ['light','dark']) test(`Panel guidance and responsive workflows ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(theme=>localStorage.setItem('baharnaj-theme',theme),theme);
 let role='admin';const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data=[];
  if(path.includes('auth/token/refresh'))data={access:'mock',role};
  else if(path.includes('statistics')||path.includes('overview')||path.includes('earnings')||path.includes('profile'))data={};
  await route.fulfill({json:data});
 });
 for(const section of ['appointments','employees','services','customers','finance','content','blog']){
  await page.goto(`/admin/${section}`);
  const guide=page.getByRole('complementary',{name:'راهنمای این بخش'});
  await expect(guide).toBeVisible();
  const details=guide.locator('details');await expect(details).not.toHaveAttribute('open','');
  await details.locator('summary').click();await expect(guide.locator('li')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),section).toBe(true);
  if(section==='finance'){
   await expect(page.getByRole('heading',{name:'سوابق و گزارش‌های پرداخت'})).toBeVisible();
   await page.getByText('نمودار درآمد و سهم خدمات',{exact:true}).click();
   await page.screenshot({path:`/tmp/panel-admin-${width}-${theme}.png`,fullPage:true});
  }
 }
 role='employee';
 for(const section of ['','calendar','earnings','availability','profile']){
  await page.goto(`/employee/${section}`);
  await expect(page.getByRole('complementary',{name:'راهنمای این بخش'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),section).toBe(true);
  if(section==='availability'){
   await expect(page.getByRole('button',{name:'ذخیره شنبه',exact:true})).toBeVisible();
   await page.screenshot({path:`/tmp/panel-employee-${width}-${theme}.png`,fullPage:true});
  }
 }
 expect(errors).toEqual([]);
});
