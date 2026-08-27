import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function PublicLayout({ children }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const loggedIn = Boolean(localStorage.getItem('access_token'))
  const role = localStorage.getItem('user_role')
  const closeMenu = () => setMenuOpen(false)
  const links = [['/', 'خانه'], ['/services', 'خدمات'], ['/about', 'درباره ما'], ['/team', 'تیم ما'], ['/gallery', 'گالری'], ['/contact', 'تماس با ما']]
  return <main dir="rtl"><nav className="nav container"><Link className="brand" to="/" onClick={closeMenu}><span>بَ</span> بهارناژ</Link><button className="mobile-menu-button" type="button" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen} aria-label="باز کردن منو">{menuOpen ? '×' : '☰'}</button><div className={`links ${menuOpen ? 'open' : ''}`}>{links.map(([path, label]) => <Link className={location.pathname === path ? 'active' : ''} key={path} to={path} onClick={closeMenu}>{label}</Link>)}</div><div className="nav-actions"><Link className="nav-cta" to={loggedIn ? (role === 'employee' ? '/employee' : '/admin') : '/login'} onClick={closeMenu}>{loggedIn ? 'پنل کاربری' : 'ورود کارکنان'}</Link><Link className="nav-cta" to="/book" onClick={closeMenu}>رزرو نوبت <span>↗</span></Link></div></nav>{children}<footer id="contact" className="footer container"><Link className="brand" to="/"><span>بَ</span> بهارناژ</Link><p>تهران، خیابان ولیعصر، کوچه نهم</p><p>شنبه تا پنجشنبه · ۹ تا ۲۰</p><a href="tel:+982112345678">۰۲۱ ۱۲۳۴ ۵۶۷۸</a></footer></main>
}

export function PageIntro({ eyebrow, title, text }) { return <section className="page-intro container"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></section> }
