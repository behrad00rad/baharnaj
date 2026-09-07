// @vitest-environment node
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'
function worker() {
  let click, background
  const showNotification = vi.fn().mockResolvedValue()
  const openWindow = vi.fn().mockResolvedValue()
  const context = {
    URL, importScripts: vi.fn(),
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
    self: {location:{href:'https://baharnaj.test/firebase-messaging-sw.js?projectId=public',origin:'https://baharnaj.test'},registration:{showNotification}, addEventListener: (event, cb) => { if(event === 'notificationclick') click=cb }},
    firebase: {initializeApp:vi.fn(), messaging: () => ({onBackgroundMessage: cb => { background=cb }})},
  }
  vm.runInNewContext(readFileSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url), 'utf8'), context)
  return {click,background,showNotification,openWindow}
}
it('shows one tagged background notification and opens its app route', async () => {
  const w=worker()
  await w.background({data:{title:'نوبت جدید',body:'پیام',notification_id:'17',target_url:'/employee/calendar?appointment=4'}})
  expect(w.showNotification).toHaveBeenCalledOnce()
  const options=w.showNotification.mock.calls[0][1]
  expect(options.tag).toBe('17')
  let done
  w.click({notification:{data:options.data,close:vi.fn()},waitUntil:p=>{done=p}})
  await done
  expect(w.openWindow).toHaveBeenCalledWith('https://baharnaj.test/employee/calendar?appointment=4')
})
it('does not navigate notification clicks to an external origin', async () => {
  const w=worker(); let done
  w.click({notification:{data:{targetUrl:'//evil.test/path'},close:vi.fn()},waitUntil:p=>{done=p}})
  await done
  expect(w.openWindow).toHaveBeenCalledWith('https://baharnaj.test/')
})
