import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/auth";
import { clearSession } from "../shared/api";
import { useTheme } from "../shared/theme";
import { SEO } from "./SEO";
import "./Customer.css";

const links = [
  ["/account", "نمای کلی", "⌂"],
  ["/account/appointments", "نوبت‌ها", "◷"],
  ["/account/notifications", "اعلان‌ها", "◌"],
  ["/account/profile", "پروفایل", "♙"],
  ["/account/preferences", "ترجیحات", "⚙"],
];

export default function CustomerLayout() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  if (role !== "customer") {
    return <div className="customer-denied" dir="rtl"><strong>ورود مشتری لازم است.</strong><button onClick={() => navigate("/login")}>بازگشت به ورود</button></div>;
  }
  const logout = () => { clearSession(); navigate("/login", { replace: true }); };
  return <>
    <SEO title="حساب من | بهارناژ" description="مدیریت نوبت‌ها و اطلاعات حساب مشتری." noindex />
    <div className="customer-app" dir="rtl">
      <header className="customer-header">
        <div className="customer-brand"><span>ب</span><div><b>بهارناژ</b><small>حساب من</small></div></div>
        <div className="customer-header-actions"><button type="button" className="customer-theme" onClick={toggleTheme} aria-label="تغییر حالت نمایش">{theme === "dark" ? "☀" : "☾"}</button><button type="button" onClick={logout}>خروج</button></div>
      </header>
      <div className="customer-layout">
        <aside className="customer-nav" aria-label="منوی حساب مشتری">{links.map(([path, label, icon]) => <NavLink end={path === "/account"} key={path} to={path}><i>{icon}</i><span>{label}</span></NavLink>)}<NavLink to="/book" className="customer-book-link"><i>＋</i><span>رزرو نوبت جدید</span></NavLink><NavLink to="/" className="customer-site-link"><i>↙</i><span>بازگشت به سایت</span></NavLink></aside>
        <main className="customer-main"><Outlet /></main>
      </div>
    </div>
  </>;
}
