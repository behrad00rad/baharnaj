import PanelGuide from "./PanelGuide";
import TextSizeControl from "./TextSizeControl";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/auth";
import NotificationBell from "./NotificationBell";
import { SEO } from "./SEO";
import { useTheme } from "../shared/theme";
import { logoutSession } from "../shared/api";
import { disableCurrentFirebaseDevice } from "../shared/firebasePush";
import "./Employee.css";
import "./EmployeeEnhancements.css";
import "./PanelRedesign.css";
import "./EmployeeWorkspace.css";

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
  const logout = async () => {
    await disableCurrentFirebaseDevice().catch(() => {});
    await logoutSession();
    navigate("/staff/login", { replace: true });
  };
  if (role !== "employee")
    return (
      <div className="employee-denied" dir="rtl">
        <strong>دسترسی متخصص لازم است.</strong>
        <button onClick={() => navigate("/staff/login")}>بازگشت به ورود کارکنان</button>
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
        <div className="employee-header-actions"><button className="panel-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "فعال‌کردن حالت روشن" : "فعال‌کردن حالت تاریک"}>{theme === "dark" ? "☀" : "☾"}</button><NotificationBell /><button className="employee-header-logout" type="button" onClick={logout}>خروج</button></div>
      </header>
      <div className="employee-layout">
        <nav className="employee-nav" aria-label="منوی پنل متخصص">
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
        <main>
          <PanelGuide role="employee" />
          <Outlet />
          <footer className="panel-preferences"><TextSizeControl /></footer>
        </main>
      </div>
    </div>
    </>
  );
}
