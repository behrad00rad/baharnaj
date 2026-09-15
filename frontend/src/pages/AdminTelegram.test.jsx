import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminTelegram from './AdminTelegram'
import { api } from '../shared/api'
vi.mock('../shared/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../shared/auth', () => ({ useAuth: () => ({ role: 'admin' }) }))
const setup={bot_username:'SalonBot',site_url:'https://salon.example',backend_url:'https://api.example',mode:'off',token_present:true,secret_present:true,verified_at:null,credentials_readable:true,revision:1}
const mount = (section='overview') => render(<MemoryRouter initialEntries={['/admin/telegram?section='+section]}><AdminTelegram/></MemoryRouter>)
beforeEach(()=>{
  api.get.mockImplementation(async url=>({data:url==='services/'?[]:url.includes('overview/')?{configured:false,dry_run:true,linked:0,eligible:0,counts:{},next_jobs:[]}:url.includes('setup/')?setup:url.includes('config/')?{reminder_hours:[24,3],status_events:['pending'],marketing_start:10,marketing_end:20}:url.includes('customer/')?{configured:false,connected:false}:{results:[],next:null}}))
  api.patch.mockResolvedValue({data:setup})
})
afterEach(()=>vi.clearAllMocks())
it('starts with one clear setup action and keeps advanced forms out of the start page',async()=>{
  mount();await screen.findByRole('button',{name:'راه‌اندازی ربات'})
  expect(screen.queryByLabelText(/توکن ربات/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('متن پیام')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'راه‌اندازی ربات'}))
  await screen.findByRole('button',{name:'ذخیره اطلاعات ربات'})
  expect(api.get.mock.calls.some(([url])=>url.includes('config/'))).toBe(false)
})
it('offers a short help page with an action that returns to the appropriate task',async()=>{
  mount('help');fireEvent.click(screen.getByRole('button',{name:/چطور برای مشتریان پیام بفرستم/}))
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button',{name:'رفتن به پیام‌ها'}))
  await screen.findByRole('button',{name:/نوشتن پیام/})
})
it('clears submitted secrets, preserves blanks, and does not send or verify on save',async()=>{
  mount('settings');const token=await screen.findByLabelText(/توکن ربات/)
  expect(token).toHaveAttribute('type','password');expect(token).toHaveValue('')
  fireEvent.change(token,{target:{value:'123456:'+ 'x'.repeat(35)}})
  fireEvent.click(screen.getByRole('button',{name:'ذخیره اطلاعات ربات'}))
  await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('telegram/admin/setup/',expect.objectContaining({token:'123456:'+'x'.repeat(35),revision:1})))
  await waitFor(()=>expect(token).toHaveValue(''))
  expect(api.post).not.toHaveBeenCalled()
  expect(api.patch.mock.calls[0][1]).not.toHaveProperty('mode')
})
it('does not queue before review and explicit confirmation, and reviews the latest edited text',async()=>{
  let saved
  api.post.mockImplementation(async(url,body)=>{
    if(url==='telegram/admin/campaigns/'){saved={...body,id:9,revision:1};return {data:saved}}
    if(url.endsWith('/preview/'))return {data:{text:saved.text,eligible:2,total:3,reachable:2,exclusions:{no_consent:1},revision:saved.revision,scheduled_at:saved.scheduled_at}}
    return {data:{status:'queued'}}
  })
  api.patch.mockImplementation(async(url,body)=>{saved={...body,id:9,revision:2};return {data:saved}})
  mount('campaigns');fireEvent.click(await screen.findByRole('button',{name:/نوشتن پیام/}))
  fireEvent.change(screen.getByLabelText('متن پیام'),{target:{value:'متن اول'}})
  fireEvent.click(screen.getByRole('button',{name:/بعدی: انتخاب مشتریان/}))
  fireEvent.click(screen.getByRole('button',{name:/بعدی: بررسی پیام/}))
  await screen.findByText('متن اول')
  expect(screen.getByRole('button',{name:'تأیید و قرار دادن در صف'})).toBeDisabled()
  expect(api.post.mock.calls.some(([url])=>url.endsWith('/schedule/'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:/ویرایش مخاطب و زمان/}))
  fireEvent.click(screen.getByRole('button',{name:/مرحله قبل/}))
  fireEvent.change(screen.getByLabelText('متن پیام'),{target:{value:'متن اصلاح شده'}})
  fireEvent.click(screen.getByRole('button',{name:/بعدی: انتخاب مشتریان/}))
  fireEvent.click(screen.getByRole('button',{name:/بعدی: بررسی پیام/}))
  await screen.findByText('متن اصلاح شده')
  fireEvent.click(screen.getByRole('checkbox',{name:/متن و زمان را بررسی کردم/}))
  fireEvent.click(screen.getByRole('button',{name:'تأیید و قرار دادن در صف'}))
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('telegram/admin/campaigns/9/schedule/',{confirm:true,recipient_count:2,revision:2}))
})
it('keeps a message draft when opening and returning from its help page',async()=>{
  mount('campaigns');fireEvent.click(await screen.findByRole('button',{name:/نوشتن پیام/}))
  fireEvent.change(screen.getByLabelText('متن پیام'),{target:{value:'پیش‌نویس من'}})
  fireEvent.click(screen.getByRole('button',{name:'این بخش چطور کار می‌کند؟'}))
  await screen.findByRole('heading',{name:'چطور برای مشتریان پیام بفرستم؟'})
  fireEvent.click(screen.getByRole('button',{name:'رفتن به پیام‌ها'}))
  expect(screen.getByLabelText('متن پیام')).toHaveValue('پیش‌نویس من')
})
