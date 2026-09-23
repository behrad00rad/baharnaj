import { useFocusScope } from "../shared/useFocusScope";
import TextSizeControl from "./TextSizeControl";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../shared/auth";
import { useTheme } from "../shared/theme";
import { siteConfig } from "../shared/siteConfig";
import { formatJalaliYear } from "../shared/date";
import { api } from "../shared/api";
import { employeeSearchFields, matchesSearch, serviceSearchFields } from "../shared/search";

const publicLinks = [
  ["/", "خانه"],
  ["/services", "سرویس‌ها"],
  ["/gallery", "گالری"],
  ["/blog", "مجله"],
  ["/team", "تیم"],
  ["/about", "دربارهٔ ما"],
  ["/contact", "تماس با ما"],
];

const unwrap = (data) => data?.results || data || [];

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function SiteSearch({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState({ services: [], posts: [], employees: [] });
  const [state, setState] = useState("loading");
  const inputRef = useRef(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!open) return undefined;
    requestAnimationFrame(() => inputRef.current?.focus());
    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    let active = true;
    Promise.all([api.get("services/"), api.get("blog/posts/"), api.get("employees/")])
      .then(([services, posts, employees]) => {
        if (!active) return;
        setCatalog({ services: unwrap(services.data), posts: unwrap(posts.data), employees: unwrap(employees.data) });
        setState("ready");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [open]);
  if (!open) return null;
  const services = query ? catalog.services.filter((item) => matchesSearch(item, query, serviceSearchFields)).slice(0, 4) : [];
  const posts = query ? catalog.posts.filter((item) => matchesSearch(item, query, ["title", "excerpt", (post) => post.category?.name])).slice(0, 4) : [];
  const employees = query ? catalog.employees.filter((item) => matchesSearch(item, query, employeeSearchFields)).slice(0, 3) : [];
  const results = [
    ...services.map((item) => ({ key: `service-${item.id}`, to: `/services/${item.slug || item.id}`, type: "سرویس", title: item.persian_name || item.name })),
    ...posts.map((item) => ({ key: `post-${item.id}`, to: `/blog/${item.slug}`, type: "مجله", title: item.title })),
    ...employees.map((item) => ({ key: `employee-${item.id}`, to: "/team", type: "متخصص", title: item.name })),
  ];
  return <div className="site-search-panel">
    <div className="container site-search-inner">
      <label className="site-search-field"><SearchIcon /><span className="sr-only">جست‌وجو در بهارناژ</span><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} placeholder="جست‌وجوی سرویس، مقاله یا متخصص…" aria-label="جست‌وجو در بهارناژ" /></label>
      <button className="site-search-close" type="button" onClick={onClose} aria-label="بستن جست‌وجو">×</button>
    </div>
    <div className="container site-search-results" aria-live="polite">
      {!query && <div className="site-search-suggestions"><span>پیشنهادها</span><Link to="/services" onClick={onClose}>همهٔ سرویس‌ها</Link><Link to="/blog" onClick={onClose}>مجله</Link><Link to="/team" onClick={onClose}>متخصصان</Link></div>}
      {query && state === "loading" && <p>در حال جست‌وجو…</p>}
      {query && state === "error" && <p>جست‌وجو فعلاً در دسترس نیست.</p>}
      {query && state === "ready" && !results.length && <p>نتیجه‌ای پیدا نشد.</p>}
      {query && results.length > 0 && <div>{results.map((result) => <Link key={result.key} to={result.to} onClick={onClose}><span>{result.type}</span><strong>{result.title}</strong><i aria-hidden="true">←</i></Link>)}</div>}
    </div>
  </div>;
}

export function PublicLayout({ children }) {
  const location = useLocation();
  const [menuPath, setMenuPath] = useState(null);
  const [searchPath, setSearchPath] = useState(null);
  const searchOpen = searchPath === location.pathname;
  const menuOpen = menuPath === location.pathname;
  const setMenuOpen = (open) => setMenuPath(open ? location.pathname : null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  useFocusScope(menuOpen, menuRef, () => setMenuOpen(false), menuButtonRef);
  const { accessToken, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const panelPath =
    role === "customer" ? "/account" : role === "employee" ? "/employee" : role === "admin" ? "/admin" : null;
  const panelLabel =
    role === "customer" ? "حساب من" : role === "employee" ? "پنل کارمند" : role === "admin" ? "پنل مدیریت" : "";
  const closeMenu = () => setMenuOpen(false);
  const closeSearch = () => setSearchPath(null);
  const toggleSearch = () => {
    setMenuOpen(false);
    setSearchPath(searchOpen ? null : location.pathname);
  };
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
            <span className="brand-logo" aria-hidden="true">
              <img className="brand-logo-light" src="/brand/icon-light.svg" alt="" width="48" height="48" />
              <img className="brand-logo-dark" src="/brand/icon-dark.svg" alt="" width="48" height="48" />
            </span>
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
            <button className="nav-search-toggle" type="button" onClick={toggleSearch} aria-label={searchOpen ? "بستن جست‌وجو" : "باز کردن جست‌وجو"} aria-expanded={searchOpen} aria-controls="site-search-panel"><SearchIcon /></button>
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
                ورود
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
        <div id="site-search-panel"><SiteSearch open={searchOpen} onClose={closeSearch} /></div>
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
                ورود
              </Link>
            )}
            <Link to="/book" onClick={closeMenu}>
              رزرو نوبت ←
            </Link>
            <Link to="/booking/manage" onClick={closeMenu}>
              پیگیری نوبت
            </Link>
          </div>
        </div>
      </div>
      <main id="public-content" tabIndex={-1} inert={menuOpen}>{children}</main>
      <footer className="site-footer" inert={menuOpen}>
        <div className="container footer-main">
          <div>
            <Link className="brand footer-brand" to="/">
              <span className="brand-logo" aria-hidden="true">
                <img src="/brand/icon-dark.svg" alt="" width="48" height="48" />
              </span>
              <b>بهارناژ<small>BAHARNAJ</small></b>
            </Link>
            <p>بهارناژ در رشت؛ تجربه و توجه به سلیقهٔ شما، از انتخاب تا جزئیات نهایی.</p>
            <address className="footer-contact">{siteConfig.address}<br /><a href={`tel:${siteConfig.mobileInternational}`}><bdi>{siteConfig.mobile}</bdi></a> · <a href={`tel:${siteConfig.additionalLandlineInternational}`}><bdi>{siteConfig.additionalLandline}</bdi></a><br />{siteConfig.hoursLabel}</address>
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
            <Link className="footer-staff-login" to="/staff/login">ورود کارکنان</Link>
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
            {formatJalaliYear()}{" "}
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
