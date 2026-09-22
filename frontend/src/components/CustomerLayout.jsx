import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/auth";
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
  if (role !== "customer") {
    return <div className="customer-denied" dir="rtl"><strong>ورود مشتری لازم است.</strong><button onClick={() => navigate("/account/login")}>بازگشت به ورود</button></div>;
  }
  return <>
    <SEO title="حساب من | بهارناژ" description="مدیریت نوبت‌ها و اطلاعات حساب مشتری." noindex />
    <div className="customer-app" dir="rtl">
      <header className="customer-header">
        <div className="customer-brand"><span>ب</span><div><b>بهارناژ</b><small>حساب من</small></div></div>
        <div className="customer-header-actions"><NavLink to="/" className="customer-header-site"><span aria-hidden="true">↙</span> بازگشت به سایت</NavLink></div>
      </header>
      <div className="customer-layout">
        <aside className="customer-nav" aria-label="منوی حساب مشتری">{links.map(([path, label, icon]) => <NavLink end={path === "/account"} key={path} to={path}><i>{icon}</i><span>{label}</span></NavLink>)}<NavLink to="/book" className="customer-book-link"><i>＋</i><span>رزرو نوبت جدید</span></NavLink></aside>
        <main className="customer-main"><Outlet /></main>
      </div>
    </div>
  </>;
}
