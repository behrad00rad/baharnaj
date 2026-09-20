import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../shared/api'
import { SEO } from '../components/SEO'
import { siteConfig } from '../shared/siteConfig'
import { formatJalaliDate } from '../shared/date'
import '../components/Telegram.css'
import './BookingManage.css'

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
    catch (requestError) { setError(requestError.response?.data?.detail || 'لغو انجام نشد. دوباره بررسی کنید یا با سالن تماس بگیرید.') }
    finally { setBusy(false) }
  }
  const statusLabels = { pending: 'در انتظار تأیید', confirmed: 'تأییدشده', completed: 'انجام‌شده', cancelled: 'لغوشده' }
  return <main className="container booking-manage-page"><SEO title="پیگیری نوبت | بهارناژ" noindex /><section className="booking-manage-panel telegram-panel"><div className="booking-manage-intro"><span className="booking-manage-eyebrow">مدیریت نوبت</span><h1>پیگیری، لغو یا تغییر نوبت</h1><p>با شماره تماس و کد پیگیری رسید، جزئیات نوبت خود را ببینید.</p></div><form className="booking-lookup-form" onSubmit={lookup}><label>شماره تماس رزرو<input required type="tel" autoComplete="tel" inputMode="tel" value={credentials.phone} onChange={e => setCredentials({ ...credentials, phone: e.target.value })} /></label><label>کد پیگیری<input required autoComplete="off" value={credentials.confirmation_code} onChange={e => setCredentials({ ...credentials, confirmation_code: e.target.value })} /></label><button className="booking-lookup-button" disabled={busy}>{busy ? 'در حال بررسی…' : 'بررسی رزرو'}</button></form>{error && <p className="booking-manage-error" role="alert">{error}</p>}{appointment && <section className="booking-result" aria-live="polite"><div className="booking-result-heading"><div><span className="booking-manage-eyebrow">رسید شما</span><h2>نوبت شما</h2></div><span className={`booking-status booking-status-${appointment.status}`}>{statusLabels[appointment.status] || appointment.status}</span></div><div className="booking-items">{appointment.items?.map(item => <div className="booking-item" key={item.id}><strong>{item.service_name}</strong><span>{formatJalaliDate(item.date, 'تاریخ نامشخص')}</span><bdi>{item.start_time}</bdi></div>)}</div><p className="booking-policy">{appointment.customer_capabilities?.policy_message || 'برای تغییر زمان با سالن هماهنگ کنید.'} <Link to="/terms">شرایط لغو و تغییر نوبت</Link></p><div className="telegram-actions booking-result-actions"><a href={`tel:${siteConfig.mobileInternational}`}>هماهنگی با سالن</a>{appointment.customer_capabilities?.can_cancel && <button disabled={busy} onClick={cancel}>لغو نوبت با تأیید</button>}</div></section>}</section></main>
}
