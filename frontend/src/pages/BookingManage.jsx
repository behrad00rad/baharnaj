import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../shared/api'
import { SEO } from '../components/SEO'
import { siteConfig } from '../shared/siteConfig'
import '../components/Telegram.css'

// Reuses the existing receipt lookup/cancellation API; a campaign link grants no access.
export default function BookingManage() {
  const [credentials, setCredentials] = useState({ phone: '', confirmation_code: '' })
  const [appointment, setAppointment] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const lookup = async e => {
    e.preventDefault(); setBusy(true); setError(''); setAppointment(null)
    try { const { data } = await api.post('customer/booking/', credentials); setAppointment(data) }
    catch { setError('رزرو پیدا نشد. شماره و کد پیگیری رسید خود را بررسی کنید.') }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!window.confirm('لغو این نوبت تأیید می‌شود؟ برای تغییر زمان، ابتدا با سالن هماهنگ کنید.')) return
    setBusy(true); setError('')
    try { const { data } = await api.patch('customer/booking/', { ...credentials, cancel: true }); setAppointment(data) }
    catch { setError('لغو انجام نشد. دوباره بررسی کنید یا با سالن تماس بگیرید.') }
    finally { setBusy(false) }
  }
  return <main className="container"><SEO title="پیگیری نوبت | بهارناژ" noindex /><section className="telegram-panel"><h1>پیگیری، لغو یا تغییر نوبت</h1><p>شماره تماس و کد پیگیری رسید برای دیدن نوبت لازم است.</p><form onSubmit={lookup}><label>شماره تماس رزرو<input required type="tel" autoComplete="tel" value={credentials.phone} onChange={e => setCredentials({ ...credentials, phone: e.target.value })} /></label><label>کد پیگیری<input required autoComplete="off" value={credentials.confirmation_code} onChange={e => setCredentials({ ...credentials, confirmation_code: e.target.value })} /></label><button disabled={busy}>بررسی رزرو</button></form>{error && <p role="alert">{error}</p>}{appointment && <><h2>نوبت شما</h2>{appointment.items?.map(item => <p key={item.id}>{item.service_name} · {item.date} · {item.start_time}</p>)}<p>وضعیت: {{ pending: 'در انتظار تأیید', confirmed: 'تأییدشده', completed: 'انجام‌شده', cancelled: 'لغوشده' }[appointment.status]}</p><p>برای تغییر زمان با سالن هماهنگ کنید. <Link to="/terms">شرایط لغو و تغییر نوبت</Link></p><div className="telegram-actions"><a href={`tel:${siteConfig.mobileInternational}`}>هماهنگی تغییر زمان با سالن</a>{['pending', 'confirmed'].includes(appointment.status) && <button disabled={busy} onClick={cancel}>لغو نوبت با تأیید</button>}</div></>}</section></main>
}
