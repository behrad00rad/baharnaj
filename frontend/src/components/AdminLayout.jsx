import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearSession } from '../shared/api'
import { useAuth } from '../shared/auth'
import NotificationBell from './NotificationBell'
import { disableCurrentFirebaseDevice } from '../shared/firebasePush'
import './Admin.css'

const links = [
  ['/', 'نمای کلی', '⌂'],
  ['/appointments', 'نوبت‌ها', '◷'],
  ['/employees', 'کارمندان', '♙'],
  ['/services', 'خدمات', '✦'],
  ['/customers', 'مشتریان', '◌'],
  ['/finance', 'مالی', '₺'],
  ['/content', 'محتوا', '▧'],
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const logout = async () => { await disableCurrentFirebaseDevice(); clearSession(); navigate('/login', { replace: true }) }
  if (role !== 'admin') return <div className="admin-denied" dir="rtl"><strong>دسترسی مدیر لازم است.</strong><button onClick={() => navigate('/login')}>بازگشت به ورود</button></div>
  return <div className="admin-app" dir="rtl"><aside className="admin-sidebar"><div className="admin-mark"><span>ب</span><div><strong>بهارناژ</strong><small>مدیریت سالن</small></div></div><nav>{links.map(([path, label, icon]) => <NavLink end={path === '/'} key={path} to={`/admin${path}`}><i>{icon}</i>{label}</NavLink>)}</nav><div className="admin-sidebar-foot"><NavLink to="/">← وب‌سایت عمومی</NavLink><button onClick={logout}>خروج از حساب</button></div></aside><main className="admin-main"><header className="admin-topbar"><div><span className="admin-kicker">پنل مدیریت</span><strong>امروز، {new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</strong></div><div className="admin-top-actions"><NotificationBell /><div className="admin-user"><span>مدیر</span><b>م</b></div></div></header><Outlet /></main></div>
}
