import { useCallback, useEffect, useState } from 'react'
import { api } from '../shared/api'
import { useAuth } from '../shared/auth'
import './Telegram.css'

const labels = { appointments: 'خبر و یادآوری نوبت', marketing: 'مایلم پیشنهادها و تخفیف‌های بهارناژ را هم دریافت کنم.', birthday: 'پیام تولد', loyalty: 'تغییر امتیاز و هدیه', care: 'مراقبت سرویس و درخواست بازخورد', manager_reports: 'گزارش‌های مدیریت برای این حساب' }
export default function TelegramConnect({ receipt: suppliedReceipt, compact = false }) {
  const { role } = useAuth()
  const receipt = role === 'customer' || role === 'admin' ? undefined : suppliedReceipt
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const [expired, setExpired] = useState(false)
  const [choices, setChoices] = useState({ appointments: role !== 'admin', marketing: false, birthday: false, loyalty: false, care: false, manager_reports: false })
  const reload = useCallback(async () => {
    const { data } = await api.get('telegram/customer/', { headers: receipt ? { 'X-Booking-Receipt': receipt } : {} })
    setState(data)
    if (data.connected) { setWaiting(false); setLink(null) }
    if (data.id) setChoices(Object.fromEntries(Object.keys(labels).map(k => [k, !!data[k]])))
    return data
  }, [receipt])
  useEffect(() => { let active = true; api.get('telegram/customer/', { headers: receipt ? { 'X-Booking-Receipt': receipt } : {} }).then(({ data }) => { if (active) { setState(data); if (data.id) setChoices(Object.fromEntries(Object.keys(labels).map(k => [k, !!data[k]]))) } }).catch(() => { if (active) setError('برای اتصال، وارد حساب شوید یا از رسید رزرو استفاده کنید.') }); return () => { active = false } }, [receipt])
  useEffect(() => {
    if (!link) return
    const timer = setTimeout(() => setExpired(true), Math.max(0, link.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [link])
  useEffect(() => {
    if (!waiting) return
    let active = true, attempts = 0, timer
    const poll = async () => {
      if (!active) return
      attempts += 1
      try {
        const { data } = await api.get('telegram/customer/', { headers: receipt ? { 'X-Booking-Receipt': receipt } : {} })
        if (!active) return
        if (data.connected) { setState(data); setWaiting(false); setLink(null); return }
      } catch { /* Retry within the bounded window. */ }
      if (!active) return
      if (attempts >= 24) { setWaiting(false); setError('اتصال هنوز تأیید نشده است. وضعیت را بررسی کنید یا پیوند تازه بگیرید.'); return }
      timer = setTimeout(poll, 5000)
    }
    timer = setTimeout(poll, 5000)
    return () => { active = false; clearTimeout(timer) }
  }, [waiting, receipt])
  const act = async (action, extra = {}) => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post('telegram/customer/', { action, receipt, ...extra })
      if (action === 'link') { setExpired(false); setLink({ ...data, expiresAt: Date.now() + data.expires_in * 1000 }); setWaiting(true) }
      else await reload()
    } catch (e) { setError(e.response?.data?.detail || 'ارتباط برقرار نشد. دوباره تلاش کنید؛ رزرو شما ثبت شده است.') }
    finally { setBusy(false) }
  }
  if (compact && !receipt && !role) return null
  if (state?.configured === false && !state.connected) return compact ? null : <p role="status">اتصال تلگرام فعلاً در دسترس نیست.</p>
  return <section className="telegram-panel" dir="rtl" aria-label="اتصال تلگرام">
    <h2>یادآوری نوبت در تلگرام</h2>
    <p>اگر مایل باشید، خبر تأیید و یادآوری نوبت را در تلگرام دریافت می‌کنید.</p>
    {receipt && <small>این اتصال فقط به همین رزرو دسترسی دارد.</small>}
    {error && <p role="alert">{error}{!compact && !role && <a href="/login"> ورود به حساب</a>}</p>}
    {!state && !error && <p role="status">در حال بررسی…</p>}
    {state && <>
      {!state.configured && <p role="status">ارسال تلگرام فعلاً غیرفعال است؛ انتخاب پیام‌ها و قطع اتصال همچنان در دسترس است.</p>}
      <p role="status">{state.connected ? (state.reachable ? '✓ متصل به تلگرام' : 'اتصال ثبت شده؛ ربات در دسترس این گفت‌وگو نیست.') : waiting ? 'منتظر تأیید شما در ربات…' : 'هنوز متصل نشده‌اید.'}</p>
      {Object.entries(labels).filter(([key]) => (role === 'admin' && !receipt) === (key === 'manager_reports')).filter(([key]) => !compact || ['appointments', 'marketing'].includes(key)).map(([key, label]) => <label className="telegram-check" key={key}><input type="checkbox" checked={choices[key]} onChange={e => setChoices({ ...choices, [key]: e.target.checked })} />{label}</label>)}
      {!compact && <div className="telegram-grid">
        <label>محله (اختیاری)<input maxLength={120} value={state.neighborhood || ''} onChange={e => setState({ ...state, neighborhood: e.target.value })} /></label>
        <label>تقویم تولد<select value={state.birth_calendar || 'jalali'} onChange={e => setState({ ...state, birth_calendar: e.target.value })}><option value="jalali">شمسی</option><option value="gregorian">میلادی</option></select></label>
        <label>ماه تولد (اختیاری)<input type="number" min="1" max="12" value={state.birth_month || ''} onChange={e => setState({ ...state, birth_month: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>روز تولد (اختیاری)<input type="number" min="1" max="31" value={state.birth_day || ''} onChange={e => setState({ ...state, birth_day: e.target.value ? Number(e.target.value) : null })} /></label>
      </div>}
      {expired && <p role="status">پیوند منقضی شده؛ پیوند تازه بگیرید.</p>}
      {compact && role === 'customer' && <p><a href="/telegram">هدیه‌های شخصی و تنظیمات پیام‌ها</a></p>}
      <div className="telegram-actions">
        {!state.connected && <button className="button" disabled={busy} onClick={() => act('link', choices)}>{link ? 'دریافت پیوند تازه' : 'اتصال به تلگرام'}</button>}
        {link && !expired && <a className="button" href={link.url} target="_blank" rel="noreferrer">باز کردن تلگرام و تأیید اتصال</a>}
        {(link || state.connected) && <button disabled={busy} onClick={() => reload().catch(() => setError('بررسی وضعیت ممکن نشد.'))}>بررسی وضعیت</button>}
        <button disabled={busy} onClick={() => act('preferences', { ...choices, ...(!compact ? { neighborhood: state.neighborhood, birth_month: state.birth_month, birth_day: state.birth_day, birth_calendar: state.birth_calendar } : {}) })}>ذخیره انتخاب پیام‌ها</button>
        {state.connected && <button disabled={busy} onClick={() => { if (window.confirm('اتصال و ارسال‌های منتظر این اتصال متوقف شود؟')) act('disconnect') }}>قطع اتصال</button>}
      </div>
    </>}
  </section>
}
