import { useEffect, useState } from 'react'
import TelegramConnect from '../components/TelegramConnect'
import { api } from '../shared/api'
import { useAuth } from '../shared/auth'
import { SEO } from '../components/SEO'

export default function TelegramSettings() {
  const { role } = useAuth()
  const [data, setData] = useState(null), [error, setError] = useState(''), [appointment, setAppointment] = useState(''), [quote, setQuote] = useState(null)
  const reload = () => api.get('telegram/benefits/').then(({ data }) => setData(data)).catch(() => setError('دریافت هدیه‌ها ممکن نشد.'))
  useEffect(() => { if (role === 'customer') api.get('telegram/benefits/').then(({ data }) => setData(data)).catch(() => setError('دریافت هدیه‌ها ممکن نشد.')) }, [role])
  const act = async body => { try { const response = await api.post('telegram/customer/', body); if (body.action === 'quote') { setQuote(response.data); return } setError('انتخاب ثبت شد.'); await reload() } catch { setError('هدیه در دسترس نیست یا قبلاً استفاده شده است. شرایط و نوبت انتخاب‌شده را بررسی کنید.') } }
  return <div className="container"><SEO title="تنظیمات تلگرام | بهارناژ" noindex /><TelegramConnect />{role === 'customer' && <section className="telegram-panel"><h2>هدیه‌ها و امتیازها</h2>{error && <p role="status">{error}</p>}{data && <><p>امتیاز ثبت‌شده: {data.balance}</p>
    {data.rules.map(r => <div className="telegram-row" key={r.id}><span>{r.name} · {r.points_cost} امتیاز · {r.percent ? `${r.percent} درصد` : `${r.fixed} تومان`} · تا {new Date(r.ends_at).toLocaleDateString('fa-IR')}</span><button disabled={data.balance < r.points_cost} onClick={() => { if (window.confirm(`تبدیل ${r.points_cost} امتیاز به هدیه «${r.name}» تأیید می‌شود؟`)) act({ action: 'reward', rule: r.id, request_id: crypto.randomUUID() }) }}>تبدیل امتیاز</button></div>)}
    <label>نوبت برای رزرو هدیه<select value={appointment} onChange={e => setAppointment(e.target.value)}><option value="">انتخاب نوبت</option>{data.appointments.map(a => <option key={a.id} value={a.id}>{a.summary}{a.estimated ? ' · قیمت برآوردی' : ''}</option>)}</select></label>
    <p>هدیه در این مرحله برای نوبت رزرو می‌شود. مدیر پس از تعیین قیمت نهایی و پیش از پرداخت، تخفیف را ثبت می‌کند. هدیه‌ها شخصی، تک‌مصرف و غیرقابل‌تجمیع هستند.</p>
    {quote && <p role="status">{quote.estimated ? 'برآورد تخفیف تا تعیین قیمت نهایی' : 'تخفیف بر اساس قیمت نهایی'}: {quote.amount === null ? 'پس از تعیین قیمت قابل محاسبه است' : `${quote.amount} تومان`}</p>}{data.benefits.length ? data.benefits.map(b => <div className="telegram-row" key={b.id}><span>هدیه #{b.id} · {b.terms.percent ? `${b.terms.percent}٪` : `${b.terms.fixed} تومان`} · {b.redeemed_at ? `استفاده‌شده: ${b.discount} تومان` : b.reserved_for ? `رزرو نوبت ${b.reserved_for}` : 'صادرشده'} · تا {new Date(b.terms.ends_at).toLocaleDateString('fa-IR')}</span>{!b.redeemed_at && <><button disabled={!appointment} onClick={() => act({ action: 'quote', appointment: Number(appointment), code: b.code })}>برآورد تخفیف</button><button disabled={!appointment} onClick={() => act({ action: 'reserve', appointment: Number(appointment), code: b.code })}>رزرو برای این نوبت</button></>}</div>) : <p>هنوز هدیه‌ای صادر نشده است.</p>}
  </>}</section>}</div>
}
