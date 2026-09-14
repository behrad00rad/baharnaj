import { useFocusScope } from "../shared/useFocusScope";
import TextSizeControl from "./TextSizeControl";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../shared/auth";
import { useTheme } from "../shared/theme";
import { siteConfig } from "../shared/siteConfig";

const publicLinks = [
  ["/", "خانه"],
  ["/services", "خدمات"],
  ["/gallery", "گالری"],
  ["/blog", "مجله"],
  ["/team", "تیم"],
  ["/about", "دربارهٔ ما"],
  ["/contact", "تماس با ما"],
];

export function PublicLayout({ children }) {
  const location = useLocation();
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === location.pathname;
  const setMenuOpen = (open) => setMenuPath(open ? location.pathname : null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  useFocusScope(menuOpen, menuRef, () => setMenuOpen(false), menuButtonRef);
  const { accessToken, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const panelPath =
    role === "employee" ? "/employee" : role === "admin" ? "/admin" : null;
  const panelLabel =
    role === "employee" ? "پنل کارمند" : role === "admin" ? "پنل مدیریت" : "";
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    const resize = () => { if (window.innerWidth > 760) setMenuPath(null); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className="public-site" dir="rtl">
      <a className="skip-link" href="#public-content">رفتن به محتوای اصلی</a>
      <header className="site-header">
        <nav className="nav container" aria-label="ناوبری اصلی">
          <Link className="brand" to="/" onClick={closeMenu}>
            <b>بهارناژ<small>BAHARNAJ</small></b>
          </Link>
          <div className="desktop-links">
            {publicLinks.map(([path, label]) => (
              <Link
                className={location.pathname === path ? "active" : ""}
                key={path}
                to={path}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="nav-actions">
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "فعال‌کردن حالت روشن" : "فعال‌کردن حالت تاریک"}
              title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            </button>
            {accessToken && panelPath ? (
              <Link className="panel-link" to={panelPath}>
                {panelLabel}
              </Link>
            ) : (
              <Link className="panel-link" to="/login">
                ورود کارکنان
              </Link>
            )}
            <Link className="nav-book" to="/book">
              رزرو نوبت<span>←</span>
            </Link>
          </div>
          <button
            ref={menuButtonRef}
            aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
            className="mobile-menu-button"
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            <span />
            <span />
          </button>
        </nav>
      </header>
      <div
        className={`mobile-navigation ${menuOpen ? "open" : ""}`}
        ref={menuRef}
        role="dialog"
        aria-modal={menuOpen ? "true" : undefined}
        aria-label="منوی اصلی"
        inert={!menuOpen}
        id="mobile-navigation"
        aria-hidden={!menuOpen}
      >
        <div className="mobile-navigation-inner container">
          <button className="mobile-menu-close" type="button" onClick={closeMenu}>بستن منو ×</button>
          <p>منوی بهارناژ</p>
          {publicLinks.map(([path, label], index) => (
            <Link
              className={location.pathname === path ? "active" : ""}
              key={path}
              to={path}
              onClick={closeMenu}
            >
              <span>۰{index + 1}</span>
              {label}
            </Link>
          ))}
          <div className="mobile-nav-actions">
            <button className="mobile-theme-toggle" type="button" onClick={toggleTheme}>
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              {theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            </button>
            {accessToken && panelPath ? (
              <Link to={panelPath} onClick={closeMenu}>
                {panelLabel}
              </Link>
            ) : (
              <Link to="/login" onClick={closeMenu}>
                ورود کارکنان
              </Link>
            )}
            <Link to="/book" onClick={closeMenu}>
              رزرو نوبت ←
            </Link>
          </div>
        </div>
      </div>
      <main id="public-content" tabIndex={-1} inert={menuOpen}>{children}</main>
      <footer className="site-footer" inert={menuOpen}>
        <div className="container footer-main">
          <div>
            <Link className="brand footer-brand" to="/">
              <b>بهارناژ<small>BAHARNAJ</small></b>
            </Link>
            <p>بهارناژ در رشت؛ تجربه و توجه به سلیقهٔ شما، از انتخاب تا جزئیات نهایی.</p>
            <address className="footer-contact">{siteConfig.province}، {siteConfig.city}، {siteConfig.area}<br /><a href={`tel:${siteConfig.mobileInternational}`}><bdi>{siteConfig.mobile}</bdi></a> · {siteConfig.hoursLabel}</address>
          </div>
          <nav aria-label="پیوندهای پایین صفحه">
            {publicLinks.filter(([path]) => path !== "/").map(([path, label]) => (
              <Link key={path} to={path}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="footer-action">
            <p>برای هماهنگی نوبت</p>
            <Link className="button button-light" to="/book">
              رزرو آنلاین <span>←</span>
            </Link>
            <a className="footer-instagram" href={siteConfig.instagram} target="_blank" rel="noopener noreferrer">Instagram بهارناژ ↗</a>
          </div>
          <div className="footer-map">
            <p>نشانی بهارناژ</p>
            <iframe
              title="موقعیت سالن زیبایی بهارناژ روی نقشه"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d198.43821781991576!2d49.5670135022841!3d37.2711547489798!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ff563840324b6a9%3A0x16e8704961c3157!2z2LPYp9mE2YYg2LLbjNio2KfbjNuMINio2YfYp9ix2YbYp9qY!5e0!3m2!1sfa!2sde!4v1789316293539!5m2!1sfa!2sde"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
        <div className="container footer-bottom">
          <TextSizeControl />
          <span>
            ©{" "}
            {new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(
              new Date().getFullYear(),
            )}{" "}
            بهارناژ
          </span>
          <div>
            <Link to="/privacy">حریم خصوصی</Link>
            <Link to="/terms">قوانین استفاده</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageIntro({ eyebrow, title, text, aside }) {
  return (
    <section className="page-intro container">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="page-intro-copy">
        <p>{text}</p>
        {aside}
      </div>
    </section>
  );
}
