import { useEffect, useState } from 'react'
import axios from 'axios'
import { toGregorian, toJalaali } from 'jalaali-js'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import './App.css'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1/' })
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  const publicEndpoint = /^(services|employees|availability|appointments)\//.test(config.url || '')
  if (token && !publicEndpoint) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
  }
  return Promise.reject(error)
})
const fallbackServices = [
  { id: 1, persian_name: 'رنگ و احیای مو', description: 'رنگی درخشان با مراقبت عمیق و شخصی‌سازی‌شده', price: 2500000, duration: 150 },
  { id: 2, persian_name: 'کوتاهی و استایل', description: 'فرم‌دهی حرفه‌ای متناسب با چهره و سبک زندگی شما', price: 850000, duration: 60 },
  { id: 3, persian_name: 'مانیکور لوکس', description: 'مراقبت کامل از دست‌ها با جزئیات ظریف', price: 650000, duration: 75 },
]
const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value || 0)} تومان`
const pad = (value) => String(value).padStart(2, '0')

function getTokenRole(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role
  } catch {
    return null
  }
}

const localIsoDate = (value = new Date()) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`

function JalaliDatePicker({ value, onChange }) {
  const today = localIsoDate()
  const current = value ? value.split('-').map(Number) : today.split('-').map(Number)
  const jalali = value ? toJalaali(current[0], current[1], current[2]) : toJalaali(...current)
  const years = Array.from({ length: 5 }, (_, index) => jalali.jy - 2 + index)
  const update = (part, nextValue) => {
    const next = { ...jalali, [part]: Number(nextValue) }
    const gregorian = toGregorian(next.jy, next.jm, Math.min(next.jd, next.jm <= 6 ? 31 : 30))
    const nextDate = `${gregorian.gy}-${pad(gregorian.gm)}-${pad(gregorian.gd)}`
    if (nextDate >= today) onChange(nextDate)
  }
  return <div className="jalali-picker"><span>تاریخ شمسی</span><div><select aria-label="سال" value={jalali.jy} onChange={(event) => update('jy', event.target.value)}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><select aria-label="ماه" value={jalali.jm} onChange={(event) => update('jm', event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat('fa-IR').format(index + 1)}</option>)}</select><select aria-label="روز" value={jalali.jd} onChange={(event) => update('jd', event.target.value)}>{Array.from({ length: jalali.jm <= 6 ? 31 : 30 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat('fa-IR').format(index + 1)}</option>)}</select></div></div>
}

function DateModal({ value, onChange, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="date-modal" role="dialog" aria-modal="true" aria-label="انتخاب تاریخ" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><strong>انتخاب تاریخ</strong><button type="button" onClick={onClose} aria-label="بستن">×</button></div><JalaliDatePicker value={value} onChange={(date) => { onChange(date); onClose() }} /></div></div>
}

function PublicLayout({ children }) {
  const location = useLocation()
  return <main dir="rtl"><nav className="nav container"><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><div className="links"><Link className={location.pathname === '/' ? 'active' : ''} to="/">خانه</Link><Link to="/services">خدمات</Link><Link to="/about">درباره ما</Link><Link to="/team">تیم ما</Link><Link to="/gallery">گالری</Link><Link to="/contact">تماس با ما</Link></div><div><Link className="nav-cta px-2" to="/login"> ورود کارکنان </Link><Link className="nav-cta" to="/book">رزرو نوبت <span>↗</span></Link></div></nav>{children}<footer id="contact" className="footer container"><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><p>تهران، خیابان ولیعصر، کوچه نهم</p><p>شنبه تا پنجشنبه · ۹ تا ۲۰</p><a href="tel:+982112345678">۰۲۱ ۱۲۳۴ ۵۶۷۸</a></footer></main>
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

function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const { data } = await api.post('auth/token/', form)
      localStorage.setItem('access_token', data.access)
      localStorage.setItem('refresh_token', data.refresh)
      const role = data.role || getTokenRole(data.access)
      localStorage.setItem('user_role', role || '')
      navigate(role === 'employee' ? '/employee' : '/admin', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'اتصال به سرور برقرار نشد یا نام کاربری و رمز عبور صحیح نیست.')
    }
  }
  return <section className="login-page container"><div><p className="eyebrow">ورود به بهارناژ</p><h1>خوش آمدی<br /><em>دوباره.</em></h1><p>برای ورود به پنل مدیریت یا پنل متخصص، اطلاعات حساب خود را وارد کنید.</p></div><form onSubmit={submit}><label>نام کاربری<input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" /></label><label>رمز عبور<input required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" /></label>{error && <p className="error">{error}</p>}<button className="button" type="submit">ورود <span>←</span></button></form></section>
}

function Booking() {
  const { services } = useServices()
  const params = new URLSearchParams(useLocation().search)
  const [serviceRows, setServiceRows] = useState([{ serviceId: params.get('service') || '', employeeId: '' }])
  const [employeesByService, setEmployeesByService] = useState({})
  const [slots, setSlots] = useState([])
  const [dateOpen, setDateOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', date: '', time: '' })
  useEffect(() => {
    serviceRows.forEach(({ serviceId }) => {
      if (serviceId && !employeesByService[serviceId]) api.get(`employees/?service=${serviceId}`).then(({ data }) => setEmployeesByService((current) => ({ ...current, [serviceId]: Array.isArray(data) ? data : data.results || [] }))).catch(() => setEmployeesByService((current) => ({ ...current, [serviceId]: [] })))
    })
  }, [serviceRows, employeesByService])
  useEffect(() => {
    const selectedRows = serviceRows.filter((row) => row.serviceId && row.employeeId)
    if (!form.date || selectedRows.length !== serviceRows.length) return
    Promise.all(selectedRows.map((row) => api.get(`availability/?service=${row.serviceId}&employee=${row.employeeId}&date=${form.date}`).then(({ data }) => data.slots || []).catch(() => []))).then((availability) => setSlots(availability.reduce((common, current) => common.filter((slot) => current.includes(slot)), availability[0] || [])))
  }, [serviceRows, form.date])
  const totalPrice = serviceRows.reduce((total, row) => total + (services.find((item) => String(item.id) === row.serviceId)?.price || 0), 0)
  const hasCompleteServiceRows = serviceRows.every((row) => row.serviceId && row.employeeId)
  const updateRow = (index, changes) => { setSlots([]); setForm((current) => ({ ...current, time: '' })); setServiceRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row)) }
  const addService = () => setServiceRows((current) => [...current, { serviceId: '', employeeId: '' }])
  const removeService = (index) => setServiceRows((current) => current.length === 1 ? [{ serviceId: '', employeeId: '' }] : current.filter((_, rowIndex) => rowIndex !== index))
  const submit = async (event) => { event.preventDefault(); setError(''); try { await api.post('appointments/', { customer_name: form.name, customer_phone: form.phone, service: serviceRows[0].serviceId, services: serviceRows.map((row) => row.serviceId), service_assignments: serviceRows.map((row) => ({ service: row.serviceId, employee: row.employeeId })), employee: serviceRows[0].employeeId, date: form.date, start_time: form.time }); setDone(true) } catch { setError('این زمان در دسترس نیست یا اطلاعات کامل نشده است. لطفاً زمان دیگری را انتخاب کنید.') } }
  if (done) return <PageIntro eyebrow="رزرو بهارناژ" title="درخواستت ثبت شد." text="برای هماهنگی نهایی، به‌زودی با شما تماس می‌گیریم." />
  return <section className="booking container"><div><p className="eyebrow">وقت تو، همین حالا</p><h1>نوبتت را<br /><em>رزرو کن.</em></h1><p>خدمت، متخصص، تاریخ و ساعت دلخواهت را انتخاب کن.</p></div><form onSubmit={submit}><div className="booking-services"><div className="field-heading"><span>خدمت و متخصص</span><button type="button" onClick={addService}>افزودن خدمت +</button></div>{serviceRows.map((row, index) => <div className="service-row" key={`${index}-${row.serviceId}`}><select required aria-label="خدمت" value={row.serviceId} onChange={(event) => updateRow(index, { serviceId: event.target.value, employeeId: '' })}><option value="">انتخاب خدمت</option>{services.filter((item) => !serviceRows.some((other, otherIndex) => otherIndex !== index && String(item.id) === other.serviceId)).map((item) => <option key={item.id} value={item.id}>{item.persian_name} · {toman(item.price)}</option>)}</select><select required aria-label="متخصص این خدمت" value={row.employeeId} disabled={!row.serviceId} onChange={(event) => updateRow(index, { employeeId: event.target.value })}><option value="">متخصص این خدمت</option>{(employeesByService[row.serviceId] || []).map((item) => <option key={item.id} value={item.id}>{item.name || 'متخصص بهارناژ'} · {item.specialty}</option>)}</select><button type="button" className="remove-service" onClick={() => removeService(index)} aria-label="حذف خدمت">×</button></div>)}</div><p className="booking-total">مجموع: {toman(totalPrice)}</p><label>تاریخ نوبت<button type="button" className="date-trigger" onClick={() => setDateOpen(true)}>{form.date ? new Intl.DateTimeFormat('fa-IR').format(new Date(`${form.date}T00:00:00`)) : 'انتخاب تاریخ'}</button></label>{dateOpen && <DateModal value={form.date} onChange={(date) => { setSlots([]); setForm({ ...form, date, time: '' }) }} onClose={() => setDateOpen(false)} />}<label>ساعت <span className="field-hint">ساعات کاری: ۰۸:۰۰ تا ۲۰:۰۰</span><select required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}><option value="">{!hasCompleteServiceRows ? 'ابتدا خدمت و متخصص را انتخاب کنید' : !form.date ? 'ابتدا تاریخ را انتخاب کنید' : 'در حال دریافت زمان‌های خالی...'}</option>{(hasCompleteServiceRows && form.date ? slots : []).map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label><label>نام و نام خانوادگی<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثلاً مریم احمدی" /></label><label>شماره تماس<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>{serviceRows.some((row) => row.serviceId && !(employeesByService[row.serviceId] || []).length) && <p className="error">برای یکی از خدمات متخصص فعالی ثبت نشده است.</p>}{hasCompleteServiceRows && form.date && !slots.length && <p className="error">برای این متخصص در تاریخ انتخاب‌شده زمان خالی وجود ندارد.</p>}{error && <p className="error">{error}</p>}<button className="button" type="submit">تأیید رزرو <span>←</span></button></form></section>
}

function Dashboard({ role }) {
  const employee = role === 'employee'
  const location = useLocation()
  const [stats, setStats] = useState(null)
  const authenticated = Boolean(localStorage.getItem('access_token'))
  const actualRole = localStorage.getItem('user_role')
  useEffect(() => { if (authenticated) api.get(employee ? 'employee/statistics/' : 'admin/statistics/').then(({ data }) => setStats(data)).catch(() => setStats(null)) }, [authenticated, employee])
  const links = employee ? [['/employee', 'نمای کلی'], ['/employee/schedule', 'برنامه نوبت‌ها'], ['/employee/work', 'ثبت خدمات'], ['/employee/income', 'درآمد'], ['/employee/profile', 'پروفایل']] : [['/admin', 'نمای کلی'], ['/admin/employees', 'کارمندان'], ['/admin/services', 'خدمات'], ['/admin/appointments', 'نوبت‌ها'], ['/admin/customers', 'مشتریان'], ['/admin/finance', 'مالی'], ['/admin/statistics', 'آمار']]
  const metrics = employee ? [['خدمات انجام‌شده', stats?.completed_services], ['درآمد ثبت‌شده', stats?.income && toman(stats.income)], ['سهم شما', stats?.commission && toman(stats.commission)]] : [['همه نوبت‌ها', stats?.appointments], ['درآمد ثبت‌شده', stats?.revenue && toman(stats.revenue)], ['کارمندان فعال', stats?.active_employees]]
  if (!authenticated) return <Navigate to="/login" replace />
  if ((employee && actualRole !== 'employee') || (!employee && !['admin'].includes(actualRole))) return <Navigate to={actualRole === 'employee' ? '/employee' : '/login'} replace />
  if (managementResources[location.pathname]) return <div className="dashboard" dir="rtl"><aside><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link>{links.map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</aside><ManagementScreen resource={managementResources[location.pathname]} /></div>
  if (employee && ['/employee/schedule', '/employee/work'].includes(location.pathname)) return <div className="dashboard" dir="rtl"><aside><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link>{links.map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</aside><EmployeeScreen path={location.pathname} /></div>
  return <div className="dashboard" dir="rtl"><aside><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><p className="panel-label">{employee ? 'پنل متخصص' : 'مدیریت سالن'}</p>{links.map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</aside><section className="panel-content"><p className="eyebrow">{employee ? 'امروز در بهارناژ' : 'مرکز مدیریت بهارناژ'}</p><h1>{employee ? 'سلام، آماده‌ای؟' : 'نمای کلی سالن'}</h1><div className="metric-grid">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>{stats ? <div className="empty-panel"><h2>گزارش‌های واقعی آماده‌اند.</h2><p>داده‌ها مستقیماً از پایگاه داده و بر اساس سطح دسترسی حساب شما دریافت شده‌اند.</p></div> : <div className="empty-panel"><h2>اطلاعاتی برای نمایش وجود ندارد.</h2><p>برای مشاهده گزارش‌ها وارد حساب کاربری شوید یا داده‌های سالن را ثبت کنید.</p></div>}</section></div>
}
function Metric({ label, value }) { return <article className="metric"><span>{label}</span><strong>{value || '—'}</strong></article> }

const managementResources = {
  '/admin/services': { title: 'خدمات', endpoint: 'admin/services/', fields: [['name', 'نام انگلیسی'], ['persian_name', 'نام فارسی'], ['category', 'دسته بندی'], ['price', 'قیمت'], ['duration', 'مدت (دقیقه)']] },
  '/admin/employees': { title: 'کارمندان', endpoint: 'admin/employees/', fields: [['user', 'شناسه کاربر'], ['specialty', 'تخصص'], ['commission_value', 'درصد کمیسیون']] },
  '/admin/customers': { title: 'مشتریان', endpoint: 'admin/users/', fields: [['username', 'نام کاربری'], ['first_name', 'نام'], ['last_name', 'نام خانوادگی'], ['phone', 'شماره تماس']] },
  '/admin/appointments': { title: 'نوبت ها', endpoint: 'admin/appointments/', fields: [['employee', 'شناسه متخصص'], ['service', 'شناسه خدمت'], ['date', 'تاریخ میلادی'], ['start_time', 'ساعت شروع'], ['customer_name', 'نام مشتری'], ['customer_phone', 'شماره تماس']] },
  '/admin/working-hours': { title: 'ساعات کاری', endpoint: 'admin/working-hours/', fields: [['employee', 'شناسه متخصص'], ['weekday', 'روز هفته (۰ تا ۶)'], ['start_time', 'شروع'], ['end_time', 'پایان']] },
  '/admin/work-records': { title: 'خدمات انجام شده', endpoint: 'admin/work-records/', fields: [['appointment', 'شناسه نوبت'], ['price', 'مبلغ'], ['notes', 'یادداشت']] },
  '/admin/finance': { title: 'مالی', endpoint: 'admin/transactions/', fields: [['type', 'نوع تراکنش'], ['amount', 'مبلغ'], ['appointment', 'شناسه نوبت'], ['description', 'شرح']] },
}

async function fetchResource(endpoint) {
  const { data } = await api.get(endpoint)
  return data.results || data
}

function ManagementScreen({ resource }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({})
  const [message, setMessage] = useState('')
  const load = async () => {
    try {
      setItems(await fetchResource(resource.endpoint))
    } catch {
      setMessage('برای دسترسی به این بخش وارد حساب مدیر شوید.')
    }
  }
  useEffect(() => {
    async function fetchItems() {
      try {
        setItems(await fetchResource(resource.endpoint))
      } catch {
        setMessage('برای دسترسی به این بخش وارد حساب مدیر شوید.')
      }
    }
    fetchItems()
  }, [resource.endpoint])
  const submit = async (event) => {
    event.preventDefault()
    try { await api.post(resource.endpoint, Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''))); setForm({}); setMessage('ذخیره شد.'); load() } catch { setMessage('اطلاعات وارد شده معتبر نیست یا دسترسی کافی ندارید.') }
  }
  const remove = async (id) => { try { await api.delete(`${resource.endpoint}${id}/`); load() } catch { setMessage('حذف انجام نشد.') } }
  return <section className="management panel-content"><div className="management-heading"><div><p className="eyebrow">مرکز مدیریت بهارناژ</p><h1>{resource.title}</h1></div><span>{items.length} مورد</span></div>{message && <p className="notice">{message}</p>}<form className="management-form" onSubmit={submit}>{resource.fields.map(([name, label]) => <label key={name}>{label}<input required={name !== 'notes'} value={form[name] || ''} onChange={(event) => setForm({ ...form, [name]: event.target.value })} /></label>)}<button className="button" type="submit">افزودن <span>←</span></button></form><div className="management-table">{items.length ? items.map((item) => <article key={item.id}><strong>#{item.id}</strong><span>{Object.entries(item).filter(([key]) => !['id', 'created_at'].includes(key)).slice(0, 3).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')}</span><button type="button" onClick={() => remove(item.id)} aria-label="حذف">حذف</button></article>) : <p className="empty-panel">هنوز داده ای برای نمایش وجود ندارد.</p>}</div></section>
}

function EmployeeScreen({ path }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ appointment: '', notes: '' })
  const [message, setMessage] = useState('')
  const endpoint = path === '/employee/schedule' ? 'employee/appointments/' : 'employee/work-records/'
  useEffect(() => {
    async function fetchItems() {
      try {
        const { data } = await api.get(endpoint)
        setItems(data.results || data)
      } catch {
        setItems([])
      }
    }
    fetchItems()
  }, [endpoint])
  const submit = async (event) => { event.preventDefault(); try { await api.post(endpoint, form); setForm({ appointment: '', notes: '' }); setMessage('خدمت ثبت شد.'); } catch { setMessage('ثبت خدمت انجام نشد. شناسه نوبت را بررسی کنید.') } }
  return <section className="management panel-content"><p className="eyebrow">پنل متخصص</p><h1>{path === '/employee/schedule' ? 'برنامه نوبت ها' : 'ثبت خدمات انجام شده'}</h1>{path === '/employee/work' && <form className="management-form" onSubmit={submit}><label>شناسه نوبت<input required value={form.appointment} onChange={(event) => setForm({ ...form, appointment: event.target.value })} /></label><label>یادداشت<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="button" type="submit">ثبت خدمت <span>←</span></button></form>}{message && <p className="notice">{message}</p>}<div className="management-table">{items.length ? items.map((item) => <article key={item.id}><strong>#{item.id}</strong><span>{item.date || item.completed_at} · {item.status || item.price}</span></article>) : <p className="empty-panel">اطلاعاتی برای نمایش وجود ندارد.</p>}</div></section>
}

function App() { return <BrowserRouter><Routes><Route path="/" element={<PublicLayout><Home /></PublicLayout>} /><Route path="/services" element={<PublicLayout><Services /></PublicLayout>} /><Route path="/services/:id" element={<PublicLayout><ServiceDetail /></PublicLayout>} /><Route path="/book" element={<PublicLayout><Booking /></PublicLayout>} /><Route path="/login" element={<PublicLayout><Login /></PublicLayout>} /><Route path="/booking-confirmation" element={<PublicLayout><PageIntro eyebrow="رزرو" title="رزرو شما تأیید شد." text="اطلاعات نوبت شما اینجا نمایش داده می‌شود." /></PublicLayout>} />{['about', 'team', 'gallery', 'contact', 'privacy', 'terms'].map((page) => <Route key={page} path={`/${page}`} element={<PublicLayout><SimplePage type={page} /></PublicLayout>} />)}<Route path="/employee/*" element={<Dashboard role="employee" />} /><Route path="/admin/*" element={<Dashboard role="admin" />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter> }
export default App
