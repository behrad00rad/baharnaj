import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/auth";
import NotificationBell from "./NotificationBell";
import { SEO } from "./SEO";
import { useTheme } from "../shared/theme";
import "./Employee.css";
import "./EmployeeEnhancements.css";

const links = [
  ["/", "امروز", "⌂"],
  ["/calendar", "تقویم", "◷"],
  ["/earnings", "درآمد", "↗"],
  ["/availability", "برنامه کاری", "◫"],
  ["/profile", "پروفایل", "♙"],
];
export default function EmployeeLayout() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  if (role !== "employee")
    return (
      <div className="employee-denied" dir="rtl">
        <strong>دسترسی متخصص لازم است.</strong>
        <button onClick={() => navigate("/login")}>بازگشت به ورود</button>
      </div>
    );
  return (
    <>
    <SEO title="پنل متخصص | بهارناژ" description="پنل داخلی بهارناژ." noindex />
    <div className="employee-app" dir="rtl">
      <header className="employee-header">
        <div className="employee-brand">
          <span>ب</span>
          <div>
            <b>بهارناژ</b>
            <small>روز کاری من</small>
          </div>
        </div>
        <div className="employee-header-actions"><button className="panel-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "فعال‌کردن حالت روشن" : "فعال‌کردن حالت تاریک"}>{theme === "dark" ? "☀" : "☾"}</button><NotificationBell /></div>
      </header>
      <main>
        <Outlet />
      </main>
      <nav className="employee-nav">
        {links.map(([path, label, icon]) => (
          <NavLink end={path === "/"} key={path} to={`/employee${path}`}>
            <i>{icon}</i>
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink className="employee-site-link" to="/">
          <i>↙</i>
          <span>بازگشت به سایت</span>
        </NavLink>
      </nav>
    </div>
    </>
  );
}
