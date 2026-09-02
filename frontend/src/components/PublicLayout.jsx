import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../shared/auth'

const publicLinks = [['/', 'خانه'], ['/services', 'خدمات'], ['/gallery', 'گالری'], ['/team', 'تیم'], ['/about', 'درباره ما'], ['/contact', 'تماس']]

export function PublicLayout({ children }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { accessToken, role } = useAuth()
  const panelPath = role === 'employee' ? '/employee' : role === 'admin' ? '/admin' : null
  const panelLabel = role === 'employee' ? 'پنل کارمند' : role === 'admin' ? 'پنل مدیریت' : ''
  const closeMenu = () => setMenuOpen(false)
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return <main className="public-site" dir="rtl">
    <header className="site-header"><nav className="nav container" aria-label="ناوبری اصلی">
      <Link className="brand" to="/" onClick={closeMenu}><span>بَ</span><b>بهارناژ</b></Link>
      <div className="desktop-links">{publicLinks.map(([path, label]) => <Link className={location.pathname === path ? 'active' : ''} key={path} to={path}>{label}</Link>)}</div>
      <div className="nav-actions">{accessToken && panelPath ? <Link className="panel-link" to={panelPath}>{panelLabel}</Link> : <Link className="panel-link" to="/login">ورود کارکنان</Link>}<Link className="nav-book" to="/book">رزرو نوبت<span>←</span></Link></div>
      <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-controls="mobile-navigation"><span /><span /></button>
    </nav></header>
    <div className={`mobile-navigation ${menuOpen ? 'open' : ''}`} id="mobile-navigation" aria-hidden={!menuOpen}>
      <div className="mobile-navigation-inner container"><p>منوی بهارناژ</p>{publicLinks.map(([path, label], index) => <Link className={location.pathname === path ? 'active' : ''} key={path} to={path} onClick={closeMenu}><span>۰{index + 1}</span>{label}</Link>)}
        <div className="mobile-nav-actions">{accessToken && panelPath ? <Link to={panelPath} onClick={closeMenu}>{panelLabel}</Link> : <Link to="/login" onClick={closeMenu}>ورود کارکنان</Link>}<Link to="/book" onClick={closeMenu}>رزرو نوبت ←</Link></div>
      </div>
    </div>
    {children}
    <footer className="site-footer"><div className="container footer-main"><div><Link className="brand footer-brand" to="/"><span>بَ</span><b>بهارناژ</b></Link><p>فضایی برای مراقبت، انتخاب و تجربه‌ای که با سبک تو هماهنگ است.</p></div><nav aria-label="پیوندهای پایین صفحه">{publicLinks.slice(0, 5).map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</nav><div className="footer-action"><p>وقت تغییر بعدی‌ات رسیده؟</p><Link className="button button-light" to="/book">رزرو آنلاین <span>←</span></Link></div></div><div className="container footer-bottom"><span>© {new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(new Date().getFullYear())} بهارناژ</span><div><Link to="/privacy">حریم خصوصی</Link><Link to="/terms">قوانین استفاده</Link></div></div></footer>
  </main>
}

export function PageIntro({ eyebrow, title, text, aside }) {
  return <section className="page-intro container"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="page-intro-copy"><p>{text}</p>{aside}</div></section>
}
