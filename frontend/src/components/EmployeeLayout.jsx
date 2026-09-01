import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearSession } from '../shared/api'
import { useAuth } from '../shared/auth'
import './Employee.css'

const links = [['/', 'امروز', '⌂'], ['/calendar', 'تقویم', '◷'], ['/earnings', 'درآمد', '↗'], ['/availability', 'برنامه کاری', '◫'], ['/profile', 'پروفایل', '♙']]
export default function EmployeeLayout() {
  const navigate = useNavigate(); const { role } = useAuth()
  if (role !== 'employee') return <div className="employee-denied" dir="rtl"><strong>دسترسی متخصص لازم است.</strong><button onClick={() => navigate('/login')}>بازگشت به ورود</button></div>
  return <div className="employee-app" dir="rtl"><header className="employee-header"><div className="employee-brand"><span>ب</span><div><b>بهارناژ</b><small>روز کاری من</small></div></div><button type="button" onClick={() => navigate('/')}>بازگشت به سایت</button><button className="employee-bell" aria-label="اعلان‌ها">◔</button></header><main><Outlet /></main><nav className="employee-nav">{links.map(([path, label, icon]) => <NavLink end={path === '/'} key={path} to={`/employee${path}`}><i>{icon}</i><span>{label}</span></NavLink>)}<button onClick={() => { clearSession(); navigate('/login', { replace: true }) }}><i>↪</i><span>خروج</span></button></nav></div>
}
