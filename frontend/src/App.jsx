import { useEffect, useState } from 'react'
import axios from 'axios'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import './App.css'

const api = axios.create({ baseURL: 'http://localhost:8000/api/v1/' })
const fallbackServices = [
  { id: 1, persian_name: 'رنگ و احیای مو', description: 'رنگی درخشان با مراقبت عمیق و شخصی‌سازی‌شده', price: 2500000, duration: 150 },
  { id: 2, persian_name: 'کوتاهی و استایل', description: 'فرم‌دهی حرفه‌ای متناسب با چهره و سبک زندگی شما', price: 850000, duration: 60 },
  { id: 3, persian_name: 'مانیکور لوکس', description: 'مراقبت کامل از دست‌ها با جزئیات ظریف', price: 650000, duration: 75 },
]
const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value || 0)} تومان`

function PublicLayout({ children }) {
  const location = useLocation()
  return <main dir="rtl"><nav className="nav container"><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><div className="links"><Link className={location.pathname === '/' ? 'active' : ''} to="/">خانه</Link><Link to="/services">خدمات</Link><Link to="/about">درباره ما</Link><Link to="/team">تیم ما</Link><Link to="/gallery">گالری</Link><Link to="/contact">تماس با ما</Link></div><Link className="nav-cta" to="/book">رزرو نوبت <span>↗</span></Link></nav>{children}<footer id="contact" className="footer container"><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><p>تهران، خیابان ولیعصر، کوچه نهم</p><p>شنبه تا پنجشنبه · ۹ تا ۲۰</p><a href="tel:+982112345678">۰۲۱ ۱۲۳۴ ۵۶۷۸</a></footer></main>
}

function useServices() {
  const [services, setServices] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => { api.get('services/').then(({ data }) => setServices(data.length ? data : fallbackServices)).catch(() => { setServices(fallbackServices); setState('error') }).finally(() => setState((current) => current === 'error' ? current : 'ready')) }, [])
  return { services, state }
}

function Home() {
  const { services } = useServices()
  return <><section id="home" className="hero container"><div className="hero-copy"><p className="eyebrow">استودیو زیبایی بهارناژ · تهران</p><h1>زیبایی،<br /><em>به سبک تو.</em></h1><p className="lead">جایی برای مکث کردن، تازه شدن و دوباره عاشق خودت شدن.</p><Link className="button" to="/book">شروع تجربه <span>←</span></Link></div><div className="hero-art"><div className="image-frame"><img src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1000&q=85" alt="فضای آرام استودیو بهارناژ" /></div><div className="round-note">آرامش<br />در هر لمس</div><div className="vertical-label">BEAUTY · CARE · RITUAL</div></div></section><section className="intro container"><p className="eyebrow">یک آیین کوچک برای خودت</p><h2>هر روز، کمی <em>بیشتر</em><br />خودت باش.</h2><p>ما باور داریم زیبایی از لحظه‌ای شروع می‌شود که برای خودت وقت می‌گذاری. در بهارناژ، هر خدمت با دقت، آرامش و عشق انجام می‌شود.</p></section><ServiceGrid services={services.slice(0, 3)} /></>
}

function ServiceGrid({ services }) { return <section className="services container"><div className="section-heading"><div><p className="eyebrow">انتخاب تو</p><h2>خدمات محبوب</h2></div><Link to="/services">مشاهده همه <span>←</span></Link></div>{services.length ? <div className="service-grid">{services.map((service) => <article className="service-card" key={service.id}><div className="service-number">۰{service.id}</div><h3>{service.persian_name}</h3><p>{service.description}</p><div className="service-meta"><span>{toman(service.price)}</span><span>{new Intl.NumberFormat('fa-IR').format(service.duration)} دقیقه</span></div><Link to={`/services/${service.id}`}>جزئیات خدمت <span>←</span></Link></article>)}</div> : <p className="state">در حال دریافت خدمات...</p>}</section> }

function Services() { const { services, state } = useServices(); return <><PageIntro eyebrow="برای درخشش تو" title="خدمات ما" text="خدماتی دقیق و آرام، برای لحظه‌هایی که فقط به خودت تعلق دارند." />{state === 'error' && <p className="notice container">ارتباط با سرور برقرار نشد؛ نمایش اطلاعات نمونه برای پیش‌نمایش.</p>}<ServiceGrid services={services} /></> }
function ServiceDetail() { const { id } = useParams(); const { services } = useServices(); const service = services.find((item) => String(item.id) === id); if (!service) return <PageIntro eyebrow="خدمت" title="در حال دریافت اطلاعات..." text="لطفاً چند لحظه دیگر دوباره تلاش کنید." />; return <section className="detail container"><div className="detail-image"><img src={service.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1000&q=85'} alt={service.persian_name} /></div><div><p className="eyebrow">خدمت اختصاصی بهارناژ</p><h1>{service.persian_name}</h1><p className="detail-text">{service.description}</p><div className="detail-meta"><strong>{toman(service.price)}</strong><span>{new Intl.NumberFormat('fa-IR').format(service.duration)} دقیقه</span></div><Link className="button" to={`/book?service=${service.id}`}>رزرو این خدمت <span>←</span></Link></div></section> }
function PageIntro({ eyebrow, title, text }) { return <section className="page-intro container"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></section> }
function SimplePage({ type }) { const content = { about: ['درباره بهارناژ', 'زیبایی در آرامش اتفاق می‌افتد.', 'بهارناژ خانه‌ای برای مراقبت، گفت‌وگو و کشف نسخه‌ای تازه از خودت است.'], team: ['تیم ما', 'دست‌های با تجربه، نگاه‌های دقیق.', 'متخصصان ما با عشق و مهارت، تجربه‌ای شخصی برای شما می‌سازند.'], contact: ['تماس با ما', 'همیشه راهی برای رسیدن هست.', 'تهران، خیابان ولیعصر، کوچه نهم\nشنبه تا پنجشنبه، ساعت ۹ تا ۲۰\n۰۲۱ ۱۲۳۴ ۵۶۷۸'], gallery: ['گالری', 'لحظه‌هایی از بهارناژ', 'برای دیدن فضای ما و جزئیات کوچک این تجربه، با ما همراه شوید.'], privacy: ['حریم خصوصی', 'اعتماد شما برای ما مهم است.', 'اطلاعات شما فقط برای هماهنگی خدمات استفاده می‌شود.'], terms: ['قوانین استفاده', 'قرار ما با شما.', 'رزرو نوبت به معنی پذیرش قوانین خدمات و زمان‌بندی است.'] }[type]; return <><PageIntro eyebrow="بهارناژ" title={content[0]} text={content[2]} /><section className="editorial container"><h2>{content[1]}</h2>{type === 'gallery' && <div className="gallery"><img src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=85" alt="فضای سالن" /><img src="https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=800&q=85" alt="جزئیات زیبایی" /><img src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=800&q=85" alt="مراقبت زیبایی" /></div>}</section></> }

function Booking() {
  const { services } = useServices()
  const params = new URLSearchParams(useLocation().search)
  const [serviceId, setServiceId] = useState(params.get('service') || '')
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [slots, setSlots] = useState([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', date: '', time: '' })
  useEffect(() => { if (serviceId) api.get(`employees/?service=${serviceId}`).then(({ data }) => setEmployees(data)).catch(() => setEmployees([])) }, [serviceId])
  useEffect(() => { if (serviceId && employeeId && form.date) api.get(`availability/?service=${serviceId}&employee=${employeeId}&date=${form.date}`).then(({ data }) => setSlots(data.slots)).catch(() => setSlots([])) }, [serviceId, employeeId, form.date])
  const submit = async (event) => { event.preventDefault(); setError(''); try { await api.post('appointments/', { customer_name: form.name, customer_phone: form.phone, service: serviceId, employee: employeeId, date: form.date, start_time: form.time }); setDone(true) } catch { setError('این زمان در دسترس نیست یا اطلاعات کامل نشده است. لطفاً زمان دیگری را انتخاب کنید.') } }
  if (done) return <PageIntro eyebrow="رزرو بهارناژ" title="درخواستت ثبت شد." text="برای هماهنگی نهایی، به‌زودی با شما تماس می‌گیریم." />
  return <section className="booking container"><div><p className="eyebrow">وقت تو، همین حالا</p><h1>نوبتت را<br /><em>رزرو کن.</em></h1><p>خدمت، متخصص، تاریخ و ساعت دلخواهت را انتخاب کن.</p></div><form onSubmit={submit}><label>خدمت مورد نظر<select required value={serviceId} onChange={(event) => { setServiceId(event.target.value); setEmployeeId('') }}><option value="">انتخاب کنید</option>{services.map((item) => <option key={item.id} value={item.id}>{item.persian_name} · {toman(item.price)}</option>)}</select></label><label>متخصص<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">انتخاب متخصص</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name || 'متخصص بهارناژ'} · {item.specialty}</option>)}</select></label><label>تاریخ<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: '' })} /></label><label>ساعت<select required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}><option value="">ابتدا تاریخ را انتخاب کنید</option>{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label><label>نام و نام خانوادگی<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثلاً مریم احمدی" /></label><label>شماره تماس<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>{!employees.length && serviceId && <p className="error">برای این خدمت هنوز متخصص فعالی ثبت نشده است.</p>}{error && <p className="error">{error}</p>}<button className="button" type="submit">تأیید رزرو <span>←</span></button></form></section>
}

function Dashboard({ role }) {
  const employee = role === 'employee'
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get(employee ? 'employee/statistics/' : 'admin/statistics/').then(({ data }) => setStats(data)).catch(() => setStats(null)) }, [employee])
  const links = employee ? [['/employee', 'نمای کلی'], ['/employee/schedule', 'برنامه نوبت‌ها'], ['/employee/work', 'ثبت خدمات'], ['/employee/income', 'درآمد'], ['/employee/profile', 'پروفایل']] : [['/admin', 'نمای کلی'], ['/admin/employees', 'کارمندان'], ['/admin/services', 'خدمات'], ['/admin/appointments', 'نوبت‌ها'], ['/admin/customers', 'مشتریان'], ['/admin/finance', 'مالی'], ['/admin/statistics', 'آمار']]
  const metrics = employee ? [['خدمات انجام‌شده', stats?.completed_services], ['درآمد ثبت‌شده', stats?.income && toman(stats.income)], ['سهم شما', stats?.commission && toman(stats.commission)]] : [['همه نوبت‌ها', stats?.appointments], ['درآمد ثبت‌شده', stats?.revenue && toman(stats.revenue)], ['کارمندان فعال', stats?.active_employees]]
  return <div className="dashboard" dir="rtl"><aside><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><p className="panel-label">{employee ? 'پنل متخصص' : 'مدیریت سالن'}</p>{links.map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</aside><section className="panel-content"><p className="eyebrow">{employee ? 'امروز در بهارناژ' : 'مرکز مدیریت بهارناژ'}</p><h1>{employee ? 'سلام، آماده‌ای؟' : 'نمای کلی سالن'}</h1><div className="metric-grid">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>{stats ? <div className="empty-panel"><h2>گزارش‌های واقعی آماده‌اند.</h2><p>داده‌ها مستقیماً از پایگاه داده و بر اساس سطح دسترسی حساب شما دریافت شده‌اند.</p></div> : <div className="empty-panel"><h2>اطلاعاتی برای نمایش وجود ندارد.</h2><p>برای مشاهده گزارش‌ها وارد حساب کاربری شوید یا داده‌های سالن را ثبت کنید.</p></div>}</section></div>
}
function Metric({ label, value }) { return <article className="metric"><span>{label}</span><strong>{value || '—'}</strong></article> }
function App() { return <BrowserRouter><Routes><Route path="/" element={<PublicLayout><Home /></PublicLayout>} /><Route path="/services" element={<PublicLayout><Services /></PublicLayout>} /><Route path="/services/:id" element={<PublicLayout><ServiceDetail /></PublicLayout>} /><Route path="/book" element={<PublicLayout><Booking /></PublicLayout>} /><Route path="/booking-confirmation" element={<PublicLayout><PageIntro eyebrow="رزرو" title="رزرو شما تأیید شد." text="اطلاعات نوبت شما اینجا نمایش داده می‌شود." /></PublicLayout>} />{['about', 'team', 'gallery', 'contact', 'privacy', 'terms'].map((page) => <Route key={page} path={`/${page}`} element={<PublicLayout><SimplePage type={page} /></PublicLayout>} />)}<Route path="/employee/*" element={<Dashboard role="employee" />} /><Route path="/admin/*" element={<Dashboard role="admin" />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter> }
export default App
