import PanelGuide from "./PanelGuide";
import TextSizeControl from "./TextSizeControl";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logoutSession } from "../shared/api";
import { useAuth } from "../shared/auth";
import NotificationBell from "./NotificationBell";
import { disableCurrentFirebaseDevice } from "../shared/firebasePush";
import { SEO } from "./SEO";
import { useTheme } from "../shared/theme";
import "./Admin.css";
import "./AdminEnhancements.css";
import "./AdminMobileNav.css";
import "./PanelRedesign.css";

const links = [
  ["/", "نمای کلی", "⌂"],
  ["/appointments", "نوبت‌ها", "◷"],
  ["/off-days", "روزهای تعطیل", "⊘"],
  ["/leave-requests", "درخواست‌های مرخصی", "◇"],
  ["/employees", "کارمندان", "♙"],
  ["/services", "سرویس‌ها", "✦"],
  ["/customers", "مشتریان", "◌"],
  ["/finance", "مالی", "₺"],
  ["/telegram", "تلگرام و ارتباط با مشتری", "↗"],
  ["/content", "محتوا", "▧"],
  ["/blog", "مقالات / وبلاگ", "¶"],
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);
  const logout = async () => {
    await disableCurrentFirebaseDevice().catch(() => {});
    await logoutSession();
    navigate("/staff/login", { replace: true });
  };
  if (role !== "admin")
    return (
      <div className="admin-denied" dir="rtl">
        <strong>دسترسی مدیر لازم است.</strong>
        <button onClick={() => navigate("/staff/login")}>بازگشت به ورود کارکنان</button>
      </div>
    );
  return (
    <>
    <SEO title="پنل مدیریت | بهارناژ" description="پنل داخلی بهارناژ." noindex />
    <div className="admin-app" dir="rtl">
      <header className="admin-topbar">
          <div className="admin-topbar-heading">
            <button
              className="admin-mobile-menu-button"
              type="button"
              aria-label={menuOpen ? "بستن منوی مدیریت" : "باز کردن منوی مدیریت"}
              aria-expanded={menuOpen}
              aria-controls="admin-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <span className="admin-kicker">پنل مدیریت</span>
              <strong>
                امروز،{" "}
                {new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "Asia/Tehran",
                }).format(new Date())}
              </strong>
            </div>
          </div>
          <div className="admin-top-actions">
            <button className="panel-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "فعال‌کردن حالت روشن" : "فعال‌کردن حالت تاریک"} title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}>{theme === "dark" ? "☀" : "☾"}</button>
            <NotificationBell />
            <div className="admin-user">
              <span>مدیر</span>
              <b>م</b>
            </div>
          </div>
      </header>
      <div className="admin-layout">
        <aside
          className={`admin-sidebar ${menuOpen ? "admin-sidebar-open" : ""}`}
          id="admin-navigation"
          aria-label="منوی مدیریت"
        >
          <div className="admin-mark">
            <span>ب</span>
            <div>
              <strong>بهارناژ</strong>
              <small>مدیریت سالن</small>
            </div>
          </div>
          <nav>
            {links.map(([path, label, icon]) => (
              <NavLink
                end={path === "/"}
                key={path}
                to={`/admin${path}`}
                onClick={() => setMenuOpen(false)}
              >
                <i>{icon}</i>
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="admin-sidebar-foot">
            <NavLink to="/" aria-label="بازگشت به وب‌سایت" title="بازگشت به وب‌سایت">
              <i aria-hidden="true">↗</i>
              <span>وب‌سایت عمومی</span>
            </NavLink>
            <button onClick={logout} aria-label="خروج از حساب" title="خروج از حساب">
              <i aria-hidden="true">↪</i>
              <span>خروج از حساب</span>
            </button>
          </div>
        </aside>
        <button
          className={`admin-menu-backdrop ${menuOpen ? "visible" : ""}`}
          type="button"
          aria-label="بستن منوی مدیریت"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
        />
        <main className="admin-main">
          <PanelGuide role="admin" />
          <Outlet />
          <footer className="panel-preferences"><TextSizeControl /></footer>
        </main>
      </div>
    </div>
    </>
  );
}
