import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, clearSession, toman } from '../shared/api'

const resources = {
  '/admin/services': { title: 'خدمات', endpoint: 'admin/services/', fields: [['name', 'نام انگلیسی'], ['persian_name', 'نام فارسی'], ['category', 'دسته بندی'], ['price', 'قیمت'], ['duration', 'مدت (دقیقه)']] },
  '/admin/gallery': { title: 'گالری', endpoint: 'admin/gallery/', upload: true, fields: [['title', 'عنوان'], ['category', 'دسته بندی'], ['image', 'تصویر'], ['image_url', 'یا آدرس تصویر'], ['description', 'توضیحات'], ['order', 'ترتیب']] },
  '/admin/employees': { title: 'کارمندان', endpoint: 'admin/employees/', fields: [['user', 'شناسه کاربر'], ['specialty', 'تخصص'], ['commission_value', 'درصد کمیسیون']] },
  '/admin/customers': { title: 'مشتریان', endpoint: 'admin/users/', fields: [['username', 'نام کاربری'], ['first_name', 'نام'], ['last_name', 'نام خانوادگی'], ['phone', 'شماره تماس']] },
  '/admin/appointments': { title: 'نوبت ها', endpoint: 'admin/appointments/', fields: [['employee', 'شناسه متخصص'], ['service', 'شناسه خدمت'], ['date', 'تاریخ میلادی'], ['start_time', 'ساعت شروع'], ['customer_name', 'نام مشتری'], ['customer_phone', 'شماره تماس']] },
  '/admin/working-hours': { title: 'ساعات کاری', endpoint: 'admin/working-hours/', fields: [['employee', 'شناسه متخصص'], ['weekday', 'روز هفته (۰ تا ۶)'], ['start_time', 'شروع'], ['end_time', 'پایان']] },
  '/admin/work-records': { title: 'خدمات انجام شده', endpoint: 'admin/work-records/', fields: [['appointment', 'شناسه نوبت'], ['price', 'مبلغ'], ['notes', 'یادداشت']] },
  '/admin/finance': { title: 'مالی', endpoint: 'admin/transactions/', fields: [['type', 'نوع تراکنش'], ['amount', 'مبلغ'], ['appointment', 'شناسه نوبت'], ['description', 'شرح']] },
}
const adminLinks = [['/admin', 'نمای کلی'], ['/admin/employees', 'کارمندان'], ['/admin/services', 'خدمات'], ['/admin/gallery', 'گالری'], ['/admin/appointments', 'نوبت‌ها'], ['/admin/customers', 'مشتریان'], ['/admin/finance', 'مالی'], ['/admin/statistics', 'آمار']]
const employeeLinks = [['/employee', 'نمای کلی'], ['/employee/schedule', 'برنامه نوبت‌ها'], ['/employee/work', 'ثبت خدمات'], ['/employee/income', 'درآمد'], ['/employee/profile', 'پروفایل']]

function Sidebar({ employee, onLogout }) {
  const links = employee ? employeeLinks : adminLinks
  return <aside><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link>{links.map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}<button className="logout-button" type="button" onClick={onLogout}>خروج</button></aside>
}

function ManagementScreen({ resource }) {
  const [items, setItems] = useState([]); const [form, setForm] = useState({}); const [message, setMessage] = useState('')
  const load = async () => { try { const { data } = await api.get(resource.endpoint); setItems(data.results || data) } catch { setMessage('برای دسترسی به این بخش وارد حساب مدیر شوید.') } }
  useEffect(() => { fetchResource(resource.endpoint).then(setItems).catch(() => setMessage('برای دسترسی به این بخش وارد حساب مدیر شوید.')) }, [resource.endpoint])
  const submit = async (event) => { event.preventDefault(); try { const payload = resource.upload ? new FormData() : Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '')); if (resource.upload) Object.entries(form).filter(([, value]) => value !== '').forEach(([name, value]) => payload.append(name, value)); await api.post(resource.endpoint, payload); setForm({}); setMessage('ذخیره شد.'); load() } catch { setMessage('اطلاعات وارد شده معتبر نیست یا دسترسی کافی ندارید.') } }
  const remove = async (id) => { try { await api.delete(`${resource.endpoint}${id}/`); load() } catch { setMessage('حذف انجام نشد.') } }
  return <section className="management panel-content"><div className="management-heading"><div><p className="eyebrow">مرکز مدیریت بهارناژ</p><h1>{resource.title}</h1></div><span>{items.length} مورد</span></div>{message && <p className="notice">{message}</p>}<form className="management-form" onSubmit={submit} encType={resource.upload ? 'multipart/form-data' : undefined}>{resource.fields.map(([name, label]) => <label key={name}>{label}<input type={name === 'image' ? 'file' : 'text'} accept={name === 'image' ? 'image/*' : undefined} required={!['notes', 'image', 'image_url', 'description', 'order'].includes(name)} value={name === 'image' ? undefined : form[name] || ''} onChange={(event) => setForm({ ...form, [name]: name === 'image' ? event.target.files[0] : event.target.value })} /></label>)}<button className="button" type="submit">افزودن <span>←</span></button></form><div className="management-table">{items.length ? items.map((item) => <article key={item.id}><strong>#{item.id}</strong><span>{Object.entries(item).filter(([key]) => !['id', 'created_at'].includes(key)).slice(0, 3).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')}</span><button type="button" onClick={() => remove(item.id)} aria-label="حذف">حذف</button></article>) : <p className="empty-panel">هنوز داده ای برای نمایش وجود ندارد.</p>}</div></section>
}

async function fetchResource(endpoint) {
  const { data } = await api.get(endpoint)
  return data.results || data
}

function EmployeeScreen({ path }) {
  const [items, setItems] = useState([]); const [form, setForm] = useState({ appointment: '', notes: '' }); const [message, setMessage] = useState(''); const endpoint = path === '/employee/schedule' ? 'employee/appointments/' : 'employee/work-records/'
  useEffect(() => { api.get(endpoint).then(({ data }) => setItems(data.results || data)).catch(() => setItems([])) }, [endpoint])
  const submit = async (event) => { event.preventDefault(); try { await api.post(endpoint, form); setForm({ appointment: '', notes: '' }); setMessage('خدمت ثبت شد.') } catch { setMessage('ثبت خدمت انجام نشد. شناسه نوبت را بررسی کنید.') } }
  return <section className="management panel-content"><p className="eyebrow">پنل متخصص</p><h1>{path === '/employee/schedule' ? 'برنامه نوبت ها' : 'ثبت خدمات انجام شده'}</h1>{path === '/employee/work' && <form className="management-form" onSubmit={submit}><label>شناسه نوبت<input required value={form.appointment} onChange={(event) => setForm({ ...form, appointment: event.target.value })} /></label><label>یادداشت<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="button" type="submit">ثبت خدمت <span>←</span></button></form>}{message && <p className="notice">{message}</p>}<div className="management-table">{items.length ? items.map((item) => <article key={item.id}><strong>#{item.id}</strong><span>{item.date || item.completed_at} · {item.status || item.price}</span></article>) : <p className="empty-panel">اطلاعاتی برای نمایش وجود ندارد.</p>}</div></section>
}

export default function Dashboard({ role }) {
  const employee = role === 'employee'; const location = useLocation(); const navigate = useNavigate(); const authenticated = Boolean(localStorage.getItem('access_token')); const actualRole = localStorage.getItem('user_role'); const [stats, setStats] = useState(null)
  useEffect(() => { if (authenticated) api.get(employee ? 'employee/statistics/' : 'admin/statistics/').then(({ data }) => setStats(data)).catch(() => setStats(null)) }, [authenticated, employee])
  if (!authenticated) return <Navigate to="/login" replace />
  if ((employee && actualRole !== 'employee') || (!employee && actualRole !== 'admin')) return <Navigate to={actualRole === 'employee' ? '/employee' : '/login'} replace />
  const logout = () => { clearSession(); navigate('/login', { replace: true }) }
  const resource = resources[location.pathname]
  if (resource) return <div className="dashboard" dir="rtl"><Sidebar employee={employee} onLogout={logout} /><ManagementScreen resource={resource} /></div>
  if (employee && ['/employee/schedule', '/employee/work'].includes(location.pathname)) return <div className="dashboard" dir="rtl"><Sidebar employee onLogout={logout} /><EmployeeScreen path={location.pathname} /></div>
  const metrics = employee ? [['خدمات انجام‌شده', stats?.completed_services], ['درآمد ثبت‌شده', stats?.income && toman(stats.income)], ['سهم شما', stats?.commission && toman(stats.commission)]] : [['همه نوبت‌ها', stats?.appointments], ['درآمد ثبت‌شده', stats?.revenue && toman(stats.revenue)], ['کارمندان فعال', stats?.active_employees]]
  return <div className="dashboard" dir="rtl"><Sidebar employee={employee} onLogout={logout} /><section className="panel-content"><p className="eyebrow">{employee ? 'امروز در بهارناژ' : 'مرکز مدیریت بهارناژ'}</p><h1>{employee ? 'سلام، آماده‌ای؟' : 'نمای کلی سالن'}</h1><div className="metric-grid">{metrics.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value || '—'}</strong></article>)}</div><div className="empty-panel"><h2>{stats ? 'گزارش‌های واقعی آماده‌اند.' : 'اطلاعاتی برای نمایش وجود ندارد.'}</h2><p>داده‌ها مستقیماً از پایگاه داده و بر اساس سطح دسترسی حساب شما دریافت شده‌اند.</p></div></section></div>
}
