import AdminOverlay from "../components/AdminOverlay";
import { PanelDisclosure } from "../components/PanelGuide";
import AdminTelegram from "./AdminTelegram";
import ServicePricingFields from "../components/ServicePricingFields";
import ItemPricing from "../components/ItemPricing";
import { formatServicePrice, servicePricingPayload } from "../shared/pricing";
import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { toGregorian, toJalaali } from "jalaali-js";
import { JalaliDatePicker } from "../components/DatePicker";
import { api, toman } from "../shared/api";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BlogEditor, BlogManagement, BlogPreview } from "./AdminBlog";
import PasswordInput from "../components/PasswordInput";
import { formatJalaliDate, formatJalaliDateTime } from "../shared/date";
import PanelPreferences from "../components/PanelPreferences";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
}).format(new Date());
const unwrap = (data) => data?.results || data || [];
const searchText = (value) => String(value ?? "").replace(/[\u064A\u0649]/g, "ی").replace(/\u0643/g, "ک").toLocaleLowerCase("fa-IR");
const entityName = (item) => [item.persian_name, item.name, item.first_name, item.last_name, item.title].filter(Boolean).join(" ") || `مورد #${item.id}`;
const matchesSearch = (item, query, fields = []) => {
  const needle = searchText(query).trim();
  if (!needle) return true;
  return [entityName(item), item.username, item.phone, item.email, item.specialty, item.description, ...fields.map((field) => item[Array.isArray(field) ? field[0] : field.name])].some((value) => searchText(value).includes(needle));
};
const firstError = (error, fallback) => {
  const value = Object.values(error.response?.data || {})[0];
  return (Array.isArray(value) ? value[0] : value) || fallback;
};
const labels = {
  pending: "در انتظار",
  confirmed: "تأیید شده",
  completed: "انجام شده",
  cancelled: "لغو شده",
};

function useResource(endpoint) {
  const [state, setState] = useState({ data: [], loading: true, error: false, count: 0, next: null, previous: null });
  const reload = () => {
    setState((current) => ({ ...current, loading: true }));
    api
      .get(endpoint)
      .then(({ data }) =>
        setState({ data: unwrap(data), loading: false, error: false, count: data?.count ?? unwrap(data).length, next: data?.next || null, previous: data?.previous || null }),
      )
      .catch(() => setState({ data: [], loading: false, error: true, count: 0, next: null, previous: null }));
  };
  useEffect(reload, [endpoint]);
  return { ...state, reload };
}
function Toast({ message, type = "success" }) {
  return (
    message && (
      <div className={`admin-toast ${type}`}>
        {type === "success" ? "✓" : "!"} {message}
      </div>
    )
  );
}
function Skeleton({ count = 3 }) {
  return (
    <div className="admin-skeletons">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
function Empty({
  title = "داده‌ای وجود ندارد",
  text = "وقتی اطلاعاتی ثبت شود، اینجا نمایش داده می‌شود.",
}) {
  return (
    <div className="admin-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function Header({ eyebrow, title, action, onAction }) {
  return (
    <div className="admin-page-head">
      <div>
        <span className="admin-kicker">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {action && (
        <button className="admin-primary" onClick={onAction}>
          ＋ {action}
        </button>
      )}
    </div>
  );
}
function Preferences() {
  return <div className="admin-page panel-preferences-page">
    <Header eyebrow="تنظیمات پنل" title="ترجیحات" />
    <PanelPreferences />
  </div>;
}
function AdminAccount() {
  const [account, setAccount] = useState(null);
  const [twoFactor, setTwoFactor] = useState(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorForm, setTwoFactorForm] = useState({ current_password: "", code: "" });
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [usernameForm, setUsernameForm] = useState({ username: "", current_password: "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", new_password_confirm: "" });
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState("");
  useEffect(() => { Promise.all([api.get("admin/account/"), api.get("admin/account/two-factor/")]).then(([{ data: accountData }, { data: twoFactorData }]) => { setAccount(accountData); setTwoFactor(twoFactorData); setUsernameForm((form) => ({ ...form, username: accountData.username })); }).catch(() => setNotice("دریافت اطلاعات حساب انجام نشد.")); }, []);
  const submitUsername = async (event) => {
    event.preventDefault(); setSaving("username"); setErrors({}); setNotice("");
    try { const { data } = await api.patch("admin/account/", usernameForm); setAccount((current) => ({ ...current, username: data.username })); setUsernameForm((form) => ({ ...form, username: data.username, current_password: "" })); setNotice("نام کاربری به‌روزرسانی شد."); }
    catch (error) { setErrors(error.response?.data || { detail: "ذخیره نام کاربری انجام نشد." }); }
    finally { setSaving(""); }
  };
  const submitPassword = async (event) => {
    event.preventDefault(); setSaving("password"); setErrors({}); setNotice("");
    try { const { data } = await api.post("admin/account/password/", passwordForm); setPasswordForm({ current_password: "", new_password: "", new_password_confirm: "" }); setNotice(data.detail); }
    catch (error) { setErrors(error.response?.data || { detail: "تغییر رمز عبور انجام نشد." }); }
    finally { setSaving(""); }
  };
  const startTwoFactor = async (event) => {
    event.preventDefault(); setSaving("two-factor-setup"); setErrors({}); setNotice("");
    try { const { data } = await api.post("admin/account/two-factor/setup/", { current_password: twoFactorForm.current_password }); setTwoFactorSetup(data); setTwoFactorForm({ current_password: "", code: "" }); }
    catch (error) { setErrors(error.response?.data || { detail: "راه‌اندازی احراز هویت دومرحله‌ای انجام نشد." }); }
    finally { setSaving(""); }
  };
  const confirmTwoFactor = async (event) => {
    event.preventDefault(); setSaving("two-factor-confirm"); setErrors({});
    try { const { data } = await api.post("admin/account/two-factor/confirm/", { code: twoFactorForm.code }); setTwoFactor(data); setRecoveryCodes(data.recovery_codes || []); setTwoFactorSetup(null); setTwoFactorForm({ current_password: "", code: "" }); setNotice("احراز هویت دومرحله‌ای فعال شد."); }
    catch (error) { setErrors(error.response?.data || { detail: "تأیید کد انجام نشد." }); }
    finally { setSaving(""); }
  };
  const disableTwoFactor = async (event) => {
    event.preventDefault(); setSaving("two-factor-disable"); setErrors({}); setNotice("");
    try { const { data } = await api.post("admin/account/two-factor/disable/", twoFactorForm); setTwoFactor(data); setTwoFactorForm({ current_password: "", code: "" }); setRecoveryCodes([]); setNotice("احراز هویت دومرحله‌ای غیرفعال شد."); }
    catch (error) { setErrors(error.response?.data || { detail: "غیرفعال‌سازی انجام نشد." }); }
    finally { setSaving(""); }
  };
  const errorFor = (field) => { const value = errors[field] || (field === "general" && errors.detail); return Array.isArray(value) ? value[0] : value; };
  return <div className="admin-page admin-account-page">
    <Header eyebrow="امنیت و دسترسی" title="حساب من" />
    <p className="admin-account-intro">تغییرات حساس با رمز عبور فعلی تأیید می‌شوند و در گزارش امنیتی ثبت خواهند شد.</p>
    {notice && <Toast message={notice} type={notice.includes("نشد") ? "error" : "success"} />}
    {!account ? <Skeleton count={2} /> : <div className="admin-account-grid">
      <form className="admin-panel admin-account-card" onSubmit={submitUsername}><div className="panel-title"><div><span>شناسه ورود</span><h2>نام کاربری</h2></div></div><p>نامی که هنگام ورود کارکنان استفاده می‌کنید.</p><label>نام کاربری<input required autoComplete="username" value={usernameForm.username} onChange={(event) => setUsernameForm({ ...usernameForm, username: event.target.value })} /></label><label>رمز عبور فعلی<PasswordInput required visibilityLabel="رمز عبور فعلی برای تغییر نام کاربری" autoComplete="current-password" value={usernameForm.current_password} onChange={(event) => setUsernameForm({ ...usernameForm, current_password: event.target.value })} /></label>{errorFor("username") && <small className="admin-field-error">{errorFor("username")}</small>}{errorFor("current_password") && <small className="admin-field-error">{errorFor("current_password")}</small>}<button className="admin-primary" disabled={saving === "username"}>{saving === "username" ? "در حال ذخیره…" : "ذخیره نام کاربری"}</button></form>
      <form className="admin-panel admin-account-card" onSubmit={submitPassword}><div className="panel-title"><div><span>امنیت ورود</span><h2>تغییر رمز عبور</h2></div></div><p>رمز تازه باید دست‌کم ۸ نویسه داشته باشد و قابل حدس نباشد.</p><label>رمز عبور فعلی<PasswordInput required visibilityLabel="رمز عبور فعلی برای تغییر رمز" autoComplete="current-password" value={passwordForm.current_password} onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })} /></label><label>رمز عبور جدید<PasswordInput required visibilityLabel="رمز عبور جدید" autoComplete="new-password" value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} /></label><label>تکرار رمز جدید<PasswordInput required visibilityLabel="تکرار رمز عبور جدید" autoComplete="new-password" value={passwordForm.new_password_confirm} onChange={(event) => setPasswordForm({ ...passwordForm, new_password_confirm: event.target.value })} /></label>{["current_password", "new_password", "new_password_confirm", "general"].map((field) => errorFor(field) && <small key={field} className="admin-field-error">{errorFor(field)}</small>)}<button className="admin-primary" disabled={saving === "password"}>{saving === "password" ? "در حال ذخیره…" : "تغییر رمز عبور"}</button></form>
      <section className="admin-panel admin-account-card admin-two-factor-card"><div className="panel-title"><div><span>محافظت اضافه</span><h2>احراز هویت دومرحله‌ای</h2></div></div>{twoFactor?.enabled ? <><p>ورود مدیر پس از رمز عبور به کد برنامه احراز هویت نیاز دارد. {twoFactor.recovery_codes_remaining} کد بازیابی باقی مانده است.</p><form onSubmit={disableTwoFactor}><label>رمز عبور فعلی<PasswordInput required visibilityLabel="رمز عبور فعلی برای غیرفعال‌سازی" autoComplete="current-password" value={twoFactorForm.current_password} onChange={(event) => setTwoFactorForm({ ...twoFactorForm, current_password: event.target.value })} /></label><label>کد برنامه یا بازیابی<input required autoComplete="one-time-code" value={twoFactorForm.code} onChange={(event) => setTwoFactorForm({ ...twoFactorForm, code: event.target.value })} /></label>{errorFor("code") && <small className="admin-field-error">{errorFor("code")}</small>}<button className="admin-secondary" disabled={saving === "two-factor-disable"}>{saving === "two-factor-disable" ? "در حال بررسی…" : "غیرفعال‌سازی"}</button></form></> : twoFactorSetup ? <form onSubmit={confirmTwoFactor}><p>کد QR را با Google Authenticator، 1Password یا برنامه مشابه اسکن کنید. اگر اسکن ممکن نیست، کلید را دستی وارد کنید.</p>{twoFactorSetup.qr_code && <img className="admin-two-factor-qr" src={twoFactorSetup.qr_code} alt="کد QR برای برنامه احراز هویت" />}<code className="admin-two-factor-key">{twoFactorSetup.manual_key}</code><label>کد ۶ رقمی برنامه<input required autoFocus inputMode="numeric" autoComplete="one-time-code" value={twoFactorForm.code} onChange={(event) => setTwoFactorForm({ ...twoFactorForm, code: event.target.value })} /></label>{errorFor("code") && <small className="admin-field-error">{errorFor("code")}</small>}<button className="admin-primary" disabled={saving === "two-factor-confirm"}>{saving === "two-factor-confirm" ? "در حال تأیید…" : "فعال‌سازی و دریافت کدها"}</button></form> : <form onSubmit={startTwoFactor}><p>با یک برنامه احراز هویت، بدون نیاز به پیامک یا تلگرام، از ورود مدیر محافظت کنید.</p><label>رمز عبور فعلی<PasswordInput required visibilityLabel="رمز عبور فعلی برای راه‌اندازی" autoComplete="current-password" value={twoFactorForm.current_password} onChange={(event) => setTwoFactorForm({ ...twoFactorForm, current_password: event.target.value })} /></label>{errorFor("current_password") && <small className="admin-field-error">{errorFor("current_password")}</small>}<button className="admin-primary" disabled={saving === "two-factor-setup"}>{saving === "two-factor-setup" ? "در حال آماده‌سازی…" : "راه‌اندازی احراز هویت دومرحله‌ای"}</button></form>}</section>
      {recoveryCodes.length > 0 && <section className="admin-panel admin-account-card admin-recovery-codes"><div className="panel-title"><div><span>فقط یک‌بار نمایش داده می‌شود</span><h2>کدهای بازیابی</h2></div></div><p>این کدها را در جایی امن و خارج از تلفن خود نگه دارید. هر کد فقط یک‌بار قابل استفاده است.</p><div>{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div><button className="admin-secondary" type="button" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n")).then(() => setNotice("کدهای بازیابی کپی شدند.")).catch(() => setNotice("کدها را دستی ذخیره کنید."))}>کپی همه کدها</button></section>}
    </div>}
  </div>;
}
function Stat({ label, value, note, accent = false }) {
  return (
    <article className={`admin-stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function DashboardHome() {
  const navigate = useNavigate();
  const appointments = useResource(
    `admin/appointments/?start_date=${today}&end_date=${today}`,
  );
  const stats = useResource("admin/statistics/");
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    api
      .get("admin/activity/")
      .then(({ data }) => setActivity(unwrap(data)))
      .catch(() => setActivity([]));
  }, []);
  const todays = appointments.data;
  const todayStats = stats.data.today || {};
  const statValue = (value) =>
    stats.loading ? "…" : stats.error ? "—" : value || 0;
  return (
    <div className="admin-page dashboard-page">
      <Header
        eyebrow="مرکز فرماندهی"
        title="نمای کلی سالن"
        action="رزرو جدید"
        onAction={() => navigate("/admin/appointments")}
      />
      <div className="admin-stat-grid">
        <Stat
          label="نوبت‌های امروز"
          value={statValue(todayStats.appointments)}
          accent
        />
        <Stat
          label="نوبت‌های این هفته"
          value={statValue(stats.data.week?.appointments)}
        />
        <Stat
          label="نوبت‌های این ماه"
          value={statValue(stats.data.month?.appointments)}
        />
        <Stat
          label="درخواست‌های در انتظار"
          value={statValue(todayStats.pending)}
        />
      </div>
      <PanelDisclosure title="آمار مالی و تأییدها">
      <div className="admin-stat-grid dashboard-secondary-stats">
        <Stat
          label="درآمد خالص امروز"
          value={stats.loading ? "…" : toman(stats.data.revenue?.today)}
          accent
        />
        <Stat
          label="درآمد خالص این هفته"
          value={stats.loading ? "…" : toman(stats.data.revenue?.week)}
        />
        <Stat
          label="درآمد خالص این ماه"
          value={stats.loading ? "…" : toman(stats.data.revenue?.month)}
        />
        <Stat label="تأییدشده امروز" value={statValue(todayStats.confirmed)} />
      </div>
      </PanelDisclosure>
      <div className="admin-grid-two">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>برنامه امروز</span>
              <h2>نوبت‌های امروز</h2>
            </div>
            <Link to="/admin/appointments">مشاهده همه ←</Link>
          </div>
          {appointments.loading ? (
            <Skeleton />
          ) : appointments.error ? (
            <Empty
              title="دریافت نوبت‌های امروز انجام نشد"
              text="لطفاً دوباره تلاش کنید."
            />
          ) : todays.length ? (
            <div className="appointment-list">
              {todays.slice(0, 6).map((item) => (
                <AppointmentRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <Empty title="امروز نوبتی ثبت نشده" text="روز آرامی در پیش است." />
          )}
        </section>
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>گزارش مالی</span>
              <h2>درآمد</h2>
            </div>
          </div>
          <div className="mini-summary">
            <span>
              دریافتی امروز
              <b>{toman(stats.data.revenue?.today)}</b>
            </span>
            <span>
              مبنای محاسبه
              <b>پرداخت منهای بازپرداخت</b>
            </span>
          </div>
          <div className="mini-summary">
            <span>
              نوبت‌های انجام‌شده <b>{todayStats.completed || 0}</b>
            </span>
            <span>
              لغوشده <b>{todayStats.cancelled || 0}</b>
            </span>
          </div>
        </section>
      </div>
      <PanelDisclosure title="گزارش‌های تکمیلی سالن">
      <div className="admin-grid-two dashboard-secondary-reports">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>عملکرد</span>
              <h2>محبوب‌ترین سرویس‌ها</h2>
            </div>
          </div>
          {stats.loading ? (
            <Skeleton count={5} />
          ) : stats.error ? (
            <Empty title="دریافت آمار سرویس‌ها انجام نشد" />
          ) : stats.data.top_services?.length ? (
            <div className="rank-list">
              {stats.data.top_services.map((service, index) => (
                <div key={service.id}>
                  <b>۰{index + 1}</b>
                  <span>{service.name}</span>
                  <em>{service.appointments} رزرو</em>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </section>
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>ردیابی تغییرات</span>
              <h2>فعالیت اخیر</h2>
            </div>
          </div>
          {activity.length ? (
            <div className="activity-list">
              {activity.slice(0, 5).map((item) => (
                <div key={item.id}>
                  <i />{" "}
                  <span>
                    {item.action || "تغییر اطلاعات"}
                    <small>
                      {formatJalaliDateTime(
                        item.changed_at || item.created_at,
                        "اخیراً",
                      )}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="فعالیتی ثبت نشده"
              text="تغییرات مدیریتی اینجا ثبت می‌شوند."
            />
          )}
        </section>
      </div>
      </PanelDisclosure>
      <div className="quick-actions">
        <Link to="/admin/appointments">＋ افزودن نوبت</Link>
        <Link to="/admin/employees">＋ افزودن کارمند</Link>
        <Link to="/admin/services">＋ افزودن سرویس</Link>
      </div>
    </div>
  );
}
function AppointmentRow({ item, onClick }) {
  const line = item.items?.[0] || item;
  const hasCancelledService = item.status !== "cancelled" && item.items?.some(
    (entry) => entry.completion_status === "cancelled",
  );
  const visualStatus = hasCancelledService ? "partially-cancelled" : item.status;
  const details =
    item.items
      ?.map((entry) => `${entry.service_name} · ${entry.employee_name}`)
      .join("، ") || line.service_name;
  return (
    <button className={`appointment-row ${visualStatus}`} onClick={onClick}>
      <span className="time">{line.start_time || "--:--"}</span>
      <span>
        <b>{item.customer_name || item.customer?.name || `رزرو #${item.id}`}</b>
        <small>{details || `نوبت ${item.items?.length || 1} سرویس`}</small>
      </span>
      <em className={`status ${visualStatus}`}>
        {hasCancelledService ? "لغو بخشی" : labels[item.status] || item.status}
        <small>{item.payment_status === "paid" ? " · تسویه" : item.remaining_total ? ` · مانده ${toman(item.remaining_total)}` : ""}</small>
      </em>
    </button>
  );
}

function Appointments() {
  const location = useLocation();
  const employees = useResource("admin/employees/");
  const services = useResource("services/");
  const [selected, setSelected] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(`${today.slice(0, 7)}-01`);
  const [status, setStatus] = useState("all");
  const [employee, setEmployee] = useState("");
  const [service, setService] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");
  const range = calendarRange(visibleMonth);
  const query = new URLSearchParams({
    start_date: range.start,
    end_date: range.end,
    ...(status !== "all" && { status }),
    ...(employee && { employee }),
    ...(service && { service }),
  });
  const resource = useResource(`admin/appointments/?${query}`);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("appointment");
    if (!/^\d+$/.test(id || "")) return;
    let active = true;
    api.get(`admin/appointments/${id}/`).then(({ data }) => {
      if (!active) return;
      setSelected(data);
      const date = data.items?.[0]?.date;
      if (date) { setSelectedDate(date); setVisibleMonth(`${date.slice(0, 7)}-01`); }
    }).catch(() => { if (active) setToast("این نوبت در دسترس نیست."); });
    return () => { active = false; };
  }, [location.search]);
  const selectedAppointments = resource.data.filter((item) =>
    item.items?.some((line) => line.date === selectedDate),
  );
  const moveMonth = (direction) => {
    const value = new Date(`${visibleMonth}T12:00:00`);
    const current = toJalaali(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
    const monthIndex = current.jm - 1 + direction;
    const jy = current.jy + Math.floor(monthIndex / 12);
    const jm = (((monthIndex % 12) + 12) % 12) + 1;
    const nextMonth = toGregorian(jy, jm, 1);
    const next = `${nextMonth.gy}-${String(nextMonth.gm).padStart(2, "0")}-${String(nextMonth.gd).padStart(2, "0")}`;
    setVisibleMonth(next);
    setSelectedDate(next);
  };
  const selectToday = () => {
    setSelectedDate(today);
    setVisibleMonth(`${today.slice(0, 7)}-01`);
  };
  const moveWeek = (direction) => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + direction * 7);
    const nextDate = localIsoDate(next);
    setSelectedDate(nextDate);
    setVisibleMonth(nextDate);
  };
  return (
    <div className="admin-page">
      <Header
        eyebrow="مدیریت نوبت‌ها"
        title="نوبت‌ها"
        action="افزودن نوبت"
        onAction={() => setCreateOpen(true)}
      />
      <div className="toolbar">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">همه وضعیت‌ها</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="filter-button"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          فیلترها
        </button>
      </div>
      {filtersOpen && (
        <div className="toolbar">
          <select
            aria-label="فیلتر متخصص"
            value={employee}
            onChange={(event) => setEmployee(event.target.value)}
          >
            <option value="">همه متخصصان</option>
            {employees.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label="فیلتر سرویس"
            value={service}
            onChange={(event) => setService(event.target.value)}
          >
            <option value="">همه سرویس‌ها</option>
            {services.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.persian_name || item.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <AppointmentCalendar
        visibleMonth={visibleMonth}
        selectedDate={selectedDate}
        appointments={resource.data}
        loading={resource.loading}
        error={resource.error}
        onPrevious={() => moveMonth(-1)}
        onNext={() => moveMonth(1)}
        onPreviousWeek={() => moveWeek(-1)}
        onNextWeek={() => moveWeek(1)}
        onToday={selectToday}
        onSelect={(date) => {
          setSelectedDate(date);
          const chosen = new Date(`${date}T12:00:00`);
          const shown = new Date(`${visibleMonth}T12:00:00`);
          const chosenJalali = toJalaali(
            chosen.getFullYear(),
            chosen.getMonth() + 1,
            chosen.getDate(),
          );
          const shownJalali = toJalaali(
            shown.getFullYear(),
            shown.getMonth() + 1,
            shown.getDate(),
          );
          if (
            chosenJalali.jy !== shownJalali.jy ||
            chosenJalali.jm !== shownJalali.jm
          )
            setVisibleMonth(date);
        }}
      />
      <section className="admin-panel calendar-panel">
        <div className="calendar-strip">
          <strong>
            {new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
              weekday: "long",
              month: "long",
              year: "numeric",
              day: "numeric",
              timeZone: "Asia/Tehran",
            }).format(new Date(`${selectedDate}T12:00:00`))}
          </strong>
          <span>
            {employees.data.length} متخصص فعال · {services.data.length} سرویس
          </span>
        </div>
        {resource.loading ? (
          <Skeleton count={7} />
        ) : resource.error ? (
          <Empty
            title="دریافت نوبت‌های تقویم انجام نشد"
            text="لطفاً دوباره تلاش کنید."
          />
        ) : selectedAppointments.length ? (
          <div className="appointment-table">
            {selectedAppointments.map((item) => (
              <AppointmentRow
                item={item}
                key={item.id}
                onClick={() => setSelected(item)}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="برای این روز نوبتی ثبت نشده است"
            text="روز دیگری را انتخاب کنید یا یک رزرو تازه بسازید."
          />
        )}
      </section>
      <Toast message={toast} />
      {createOpen && (
        <AdminAppointmentForm
          close={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            resource.reload();
            setToast("نوبت ثبت شد");
          }}
        />
      )}
      {selected && (
        <AppointmentDrawer
          item={selected}
          close={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            resource.reload();
            setToast("نوبت به‌روزرسانی شد");
          }}
        />
      )}
    </div>
  );
}
function AppointmentCalendar({
  visibleMonth,
  selectedDate,
  appointments,
  loading,
  error,
  onSelect,
  onPrevious,
  onNext,
  onPreviousWeek,
  onNextWeek,
  onToday,
}) {
  const value = new Date(`${visibleMonth}T12:00:00`);
  const jalali = toJalaali(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
  );
  const first = toGregorian(jalali.jy, jalali.jm, 1);
  const start = new Date(first.gy, first.gm - 1, first.gd);
  start.setDate(start.getDate() - start.getDay());
  const selectedWeekStart = new Date(`${selectedDate}T12:00:00`);
  selectedWeekStart.setDate(
    selectedWeekStart.getDate() - selectedWeekStart.getDay(),
  );
  selectedWeekStart.setHours(0, 0, 0, 0);
  const selectedWeekEnd = new Date(selectedWeekStart);
  selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6);
  selectedWeekEnd.setHours(23, 59, 59, 999);
  return (
    <section className="admin-panel appointment-calendar">
      <div className="panel-title">
        <div>
          <span>تقویم شمسی</span>
          <h2>
            {new Intl.NumberFormat("fa-IR").format(jalali.jy)} /{" "}
            {new Intl.NumberFormat("fa-IR").format(jalali.jm)}
          </h2>
        </div>
        <div className="calendar-month-actions calendar-desktop-actions">
          <button type="button" aria-label="ماه قبل" onClick={onPrevious}>
            ‹
          </button>
          <button type="button" onClick={onToday}>
            امروز
          </button>
          <button type="button" aria-label="ماه بعد" onClick={onNext}>
            ›
          </button>
        </div>
        <div className="calendar-week-actions">
          <button type="button" aria-label="هفته قبل" onClick={onPreviousWeek}>
            ‹
          </button>
          <button type="button" onClick={onToday}>
            این هفته
          </button>
          <button type="button" aria-label="هفته بعد" onClick={onNextWeek}>
            ›
          </button>
        </div>
      </div>
      <div className="appointment-calendar-weekdays">
        {["ی", "د", "س", "چ", "پ", "ج", "ش"].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <Empty title="دریافت تقویم انجام نشد" />
      ) : (
        <div className="appointment-calendar-days">
          {Array.from({ length: 42 }, (_, index) => {
            const day = new Date(start);
            day.setDate(start.getDate() + index);
            const iso = localIsoDate(day);
            const local = toJalaali(
              day.getFullYear(),
              day.getMonth() + 1,
              day.getDate(),
            );
            const dayAppointments = appointments.filter((item) =>
              item.items?.some((line) => line.date === iso),
            );
            const serviceCounts = {};
            dayAppointments.forEach((item) =>
              item.items
                ?.filter((line) => line.date === iso)
                .forEach((line) => {
                  serviceCounts[line.service_name] =
                    (serviceCounts[line.service_name] || 0) + 1;
                }),
            );
            const services = Object.entries(serviceCounts);
            const isSelectedWeek =
              day >= selectedWeekStart && day <= selectedWeekEnd;
            return (
              <button
                type="button"
                aria-label={iso}
                key={iso}
                className={[
                  iso === selectedDate && "selected",
                  iso === today && "today",
                  isSelectedWeek && "current-week",
                  (local.jy !== jalali.jy || local.jm !== jalali.jm) && "muted",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect(iso)}
              >
                <span className="calendar-day-number">
                  {new Intl.NumberFormat("fa-IR").format(local.jd)}
                </span>
                <span className="calendar-day-weekday">
                  {new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", { weekday: "long", timeZone: "Asia/Tehran" }).format(
                    day,
                  )}
                </span>
                <span className="calendar-day-badges">
                  {services.slice(0, 2).map(([name, count]) => (
                    <small key={name}>
                      {name} {new Intl.NumberFormat("fa-IR").format(count)}
                    </small>
                  ))}
                  {services.length > 2 && (
                    <small>
                      +
                      {new Intl.NumberFormat("fa-IR").format(
                        services.length - 2,
                      )}
                    </small>
                  )}
                </span>
                {dayAppointments.length > 0 && (
                  <b>
                    {new Intl.NumberFormat("fa-IR").format(
                      dayAppointments.length,
                    )}{" "}
                    نوبت
                  </b>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
function localIsoDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function calendarRange(month) {
  const value = new Date(`${month}T12:00:00`);
  const jalali = toJalaali(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
  );
  const first = toGregorian(jalali.jy, jalali.jm, 1);
  const start = new Date(first.gy, first.gm - 1, first.gd);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}
function AdminAppointmentForm({ close, onCreated }) {
  const customers = useResource("admin/customer-options/");
  const services = useResource("services/");
  const [form, setForm] = useState({
    date: today,
    status: "pending",
  });
  const [selections, setSelections] = useState([]);
  const [employees, setEmployees] = useState({});
  const [slots, setSlots] = useState([]);
  const [newCustomer, setNewCustomer] = useState(false);
  const [error, setError] = useState("");
  const update = (name, value) => setForm({ ...form, [name]: value });
  useEffect(() => {
    selections.forEach((selection) => {
      if (selection.service && !employees[selection.service])
        api
          .get(`employees/?service=${selection.service}`)
          .then(({ data }) =>
            setEmployees((current) => ({
              ...current,
              [selection.service]: unwrap(data),
            })),
          )
          .catch(() =>
            setEmployees((current) => ({
              ...current,
              [selection.service]: [],
            })),
          );
    });
  }, [selections, employees]);
  useEffect(() => {
    if (
      !selections.length ||
      selections.some(
        (selection) => !selection.service || !selection.employee,
      ) ||
      !form.date
    )
      return setSlots([]);
    api
      .get(
        `availability/?date=${form.date}&items=${encodeURIComponent(JSON.stringify(selections.map(({ service, employee }) => ({ service, employee }))))}`,
      )
      .then(({ data }) => setSlots(data.slots || []))
      .catch(() => setSlots([]));
  }, [selections, form.date]);
  const submit = async (event) => {
    event.preventDefault();
    if (!selections.length || !form.time) return;
    let current = new Date(`2000-01-01T${form.time}:00`);
    const items = selections.map((selection) => {
      const service = services.data.find(
        (item) => String(item.id) === String(selection.service),
      );
      const start_time = current.toTimeString().slice(0, 5);
      current = new Date(current.getTime() + Number(service.duration) * 60000);
      return {
        ...selection,
        date: form.date,
        start_time,
        end_time: current.toTimeString().slice(0, 5),
      };
    });
    try {
      await api.post("admin/appointments/", {
        ...(newCustomer
          ? {
              customer_name: form.customer_name,
              customer_phone: form.customer_phone,
            }
          : { customer: form.customer }),
        notes: form.notes || "",
        status: form.status,
        items,
      });
      onCreated();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "ثبت نوبت انجام نشد");
    }
  };
  return (
    <AdminOverlay className="modal-backdrop" onMouseDown={close}>
      <form
        className="admin-modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="drawer-close" onClick={close}>
          ×
        </button>
        <span className="admin-kicker">رزرو جدید</span>
        <h2>افزودن نوبت</h2>
        <label className="check-label">
          <input
            type="checkbox"
            checked={newCustomer}
            onChange={(event) => setNewCustomer(event.target.checked)}
          />{" "}
          مشتری جدید
        </label>
        {newCustomer ? (
          <>
            <label>
              نام مشتری
              <input
                required
                value={form.customer_name || ""}
                onChange={(event) =>
                  update("customer_name", event.target.value)
                }
              />
            </label>
            <label>
              شماره تماس
              <input
                required
                value={form.customer_phone || ""}
                onChange={(event) =>
                  update("customer_phone", event.target.value)
                }
              />
            </label>
          </>
        ) : (
          <label>
            مشتری
            <select
              required
              value={form.customer || ""}
              onChange={(event) => update("customer", event.target.value)}
            >
              <option value="">انتخاب کنید</option>
              {customers.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.phone}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="admin-service-picker">
          <legend>سرویس‌ها و متخصصان</legend>
          {selections.map((selection, index) => (
            <div className="appointment-line" key={index}>
              <label>
                سرویس
                <select
                  required
                  value={selection.service || ""}
                  onChange={(event) =>
                    setSelections(
                      selections.map((item, position) =>
                        position === index
                          ? {
                              ...item,
                              service: event.target.value,
                              employee: "",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">انتخاب کنید</option>
                  {services.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.persian_name || item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                متخصص
                <select
                  required
                  value={selection.employee || ""}
                  onChange={(event) =>
                    setSelections(
                      selections.map((item, position) =>
                        position === index
                          ? { ...item, employee: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">انتخاب کنید</option>
                  {(employees[selection.service] || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label="حذف سرویس"
                onClick={() =>
                  setSelections(
                    selections.filter((_, position) => position !== index),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="employee-action"
            onClick={() =>
              setSelections([...selections, { service: "", employee: "" }])
            }
          >
            افزودن سرویس
          </button>
        </fieldset>
        <label>
          تاریخ
          <JalaliDatePicker
            value={form.date}
            onChange={(date) => update("date", date)}
          />
        </label>
        <label>
          ساعت
          <select
            required
            value={form.time || ""}
            onChange={(event) => update("time", event.target.value)}
          >
            <option value="">انتخاب کنید</option>
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
        <label>
          یادداشت
          <textarea
            value={form.notes || ""}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>
        <label>
          وضعیت
          <select
            value={form.status}
            onChange={(event) => update("status", event.target.value)}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && <small className="admin-field-error">{error}</small>}
        <button className="admin-primary" type="submit">
          ثبت نوبت
        </button>
      </form>
    </AdminOverlay>
  );
}
function AppointmentDrawer({ item, close, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({
    amount: item.remaining_total || "",
    payment_method: "cash",
    notes: "",
  });
  const [refund, setRefund] = useState({ payment: "", amount: "", reason: "" });
  const [financeError, setFinanceError] = useState("");
  const cancelledLine = item.items?.find((line) => line.completion_status === "cancelled");
  const cancellation = [...(item.status_history || [])].reverse().find((entry) => entry.status === "cancelled" || (entry.changed_by_role === "employee" && entry.reason));
  const isCancelled = item.status === "cancelled" || Boolean(cancelledLine);
  const changeStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`admin/appointments/${item.id}/`, { status });
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  const recordPayment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFinanceError("");
    try {
      await api.post("admin/payments/", { appointment: item.id, ...payment });
      onSaved();
    } catch (error) {
      setFinanceError(firstError(error, "ثبت پرداخت انجام نشد"));
      setSaving(false);
    }
  };
  const recordRefund = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFinanceError("");
    try {
      await api.post("admin/refunds/", refund);
      onSaved();
    } catch (error) {
      setFinanceError(firstError(error, "ثبت بازپرداخت انجام نشد"));
      setSaving(false);
    }
  };
  return (
    <AdminOverlay className="drawer-backdrop" onMouseDown={close}>
      <aside
        className={`admin-drawer appointment-drawer ${isCancelled ? "is-cancelled" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="drawer-close" onClick={close}>
          ×
        </button>
        <span className="admin-kicker">جزئیات رزرو #{item.id}</span>
        <h2>{item.customer_name || item.customer?.name || "مشتری سالن"}</h2>
        <p className="drawer-meta">
          {item.customer?.phone || item.customer_phone || "شماره ثبت نشده"}
        </p>
        <div className="appointment-summary-bar"><span className={`status ${item.status}`}>{labels[item.status]}</span><b>{formatJalaliDate(item.items?.[0]?.date, "تاریخ نامشخص")} · {item.items?.[0]?.start_time?.slice(0,5)}</b><span>{item.items?.length || 0} سرویس</span></div>
        {isCancelled && <section className="cancellation-card"><span>لغو شده</span><h3>{item.status === "cancelled" ? "این نوبت لغو شده است" : `${cancelledLine?.service_name || "یک سرویس"} از این نوبت لغو شده است`}</h3><dl><div><dt>لغو توسط</dt><dd>{cancellation?.changed_by_name || "ثبت نشده"}{cancellation?.changed_by_role === "employee" ? " (متخصص)" : ""}</dd></div><div><dt>زمان لغو</dt><dd>{formatJalaliDateTime(cancellation?.changed_at, "ثبت نشده")}</dd></div><div><dt>دلیل</dt><dd>{cancellation?.reason || "دلیلی ثبت نشده است."}</dd></div></dl></section>}
        {item.has_unresolved_prices && <p className="pricing-warning">قیمت برخی سرویس‌ها نهایی نشده است. پیش از پرداخت، قیمت نهایی را ثبت کنید.</p>}
        <div className="drawer-section">
          <h3>سرویس‌های رزرو</h3>
          {item.items?.length ? (
            item.items.map((line) => (
              <div className="drawer-item" key={line.id}>
                <b>{line.service_name || `سرویس #${line.service}`}</b>
                <span>
                  {formatJalaliDate(line.date, "تاریخ نامشخص")} · {line.start_time} تا {line.end_time}
                </span>
                <ItemPricing item={line} role="admin" onSaved={onSaved} />
                <span className={`status ${line.completion_status}`}>{labels[line.completion_status] || line.completion_status}</span>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </div>
        {!['completed', 'cancelled'].includes(item.status) && <div className="drawer-actions">
          <button disabled={saving} onClick={() => changeStatus("confirmed")}>
            تأیید
          </button>
          <button disabled={saving} onClick={() => changeStatus("completed")}>
            تکمیل
          </button>
          <button
            className="danger"
            disabled={saving}
            onClick={() => changeStatus("cancelled")}
          >
            لغو رزرو
          </button>
        </div>}
        <div className="drawer-section">
          <h3>وضعیت مالی</h3>
          <div className="mini-summary">
            <span>
              {item.has_unresolved_prices ? "مبلغ قطعی فعلی" : "مبلغ نوبت"}<b>{toman(item.appointment_total)}</b>
            </span>
            <span>
              پرداخت‌شده<b>{toman(item.net_paid)}</b>
            </span>
            <span>
              مانده<b>{toman(item.remaining_total)}</b>
            </span>
          </div>
          <p className="drawer-meta">
            وضعیت: {item.payment_status || "unpaid"}
          </p>
          {item.status !== "cancelled" && <form className="employee-form" onSubmit={recordPayment}>
            <label>
              مبلغ پرداخت
              <input
                type="number"
                min="1"
                max={item.remaining_total}
                value={payment.amount}
                onChange={(event) =>
                  setPayment({ ...payment, amount: event.target.value })
                }
                required
              />
            </label>
            <label>
              روش پرداخت
              <select
                value={payment.payment_method}
                onChange={(event) =>
                  setPayment({ ...payment, payment_method: event.target.value })
                }
              >
                <option value="cash">نقدی</option>
                <option value="card">کارت</option>
                <option value="bank_transfer">انتقال بانکی</option>
                <option value="online">آنلاین</option>
                <option value="other">سایر</option>
              </select>
            </label>
            <label>
              توضیحات
              <input
                value={payment.notes}
                onChange={(event) =>
                  setPayment({ ...payment, notes: event.target.value })
                }
              />
            </label>
            <button
              className="admin-primary"
              disabled={saving || !item.remaining_total || item.has_unresolved_prices}
            >
              ثبت پرداخت
            </button>
          </form>}
          {item.payments?.map((entry) => (
            <div className="drawer-item" key={entry.id}>
              <b>
                {toman(entry.amount)} · {entry.payment_method}
              </b>
              <span>
                {entry.status} · بازپرداخت {toman(entry.refunded_total)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setRefund({
                    ...refund,
                    payment: entry.id,
                    amount: entry.amount - entry.refunded_total,
                  })
                }
              >
                بازپرداخت
              </button>
            </div>
          ))}
          {refund.payment && (
            <form className="employee-form" onSubmit={recordRefund}>
              <label>
                مبلغ بازپرداخت
                <input
                  type="number"
                  min="1"
                  value={refund.amount}
                  onChange={(event) =>
                    setRefund({ ...refund, amount: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                دلیل
                <input
                  value={refund.reason}
                  onChange={(event) =>
                    setRefund({ ...refund, reason: event.target.value })
                  }
                />
              </label>
              <button className="admin-primary" disabled={saving}>
                ثبت بازپرداخت
              </button>
            </form>
          )}
          {financeError && (
            <small className="admin-field-error">{financeError}</small>
          )}
        </div>
        <PanelDisclosure title="تاریخچه وضعیت نوبت">
          {item.status_history?.length ? (
            item.status_history.map((history) => (
              <p className="history-row" key={history.id}>
                <b>{labels[history.status] || history.status}</b>
                <span>{history.changed_by_name || "سیستم"} · {formatJalaliDateTime(history.changed_at)}<br />{history.reason || "بدون توضیح"}</span>
              </p>
            ))
          ) : (
            <Empty title="تاریخچه‌ای ثبت نشده" />
          )}
        </PanelDisclosure>
      </aside>
    </AdminOverlay>
  );
}

function CrudPage({
  type,
  endpoint,
  title,
  eyebrow,
  fields = [],
  uploads = false,
  deletable = false,
}) {
  const resource = useResource(endpoint);
  const [options, setOptions] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [optionDrafts, setOptionDrafts] = useState({});
  const [optionErrors, setOptionErrors] = useState({});
  const [optionSaving, setOptionSaving] = useState({});
  const [search, setSearch] = useState("");
  const filteredItems = useMemo(() => resource.data.filter((item) => matchesSearch(item, search, fields)), [resource.data, search, fields]);
  useEffect(() => {
    const selectFields = fields.filter((field) => field.optionsEndpoint);
    if (!selectFields.length) return;
    Promise.all(
      selectFields.map((field) =>
        api
          .get(field.optionsEndpoint)
          .then(({ data }) => [field.name, unwrap(data)])
          .catch(() => [field.name, []]),
      ),
    ).then((results) => setOptions(Object.fromEntries(results)));
  }, [endpoint, fields]);
  const createOption = async (field) => {
    const name = (optionDrafts[field.name] || "").trim();
    if (!name) {
      setOptionErrors({
        ...optionErrors,
        [field.name]: "نام دسته‌بندی را وارد کنید",
      });
      return;
    }
    setOptionSaving({ ...optionSaving, [field.name]: true });
    setOptionErrors({ ...optionErrors, [field.name]: "" });
    try {
      const { data } = await api.post(field.createEndpoint, { name });
      setOptions({
        ...options,
        [field.name]: [...(options[field.name] || []), data],
      });
      setForm({ ...form, [field.name]: data.id });
      setOptionDrafts({ ...optionDrafts, [field.name]: "" });
    } catch (error) {
      const detail = error.response?.data?.name || error.response?.data?.detail;
      setOptionErrors({
        ...optionErrors,
        [field.name]: Array.isArray(detail)
          ? detail.join(" ")
          : detail || "ثبت دسته‌بندی انجام نشد",
      });
    } finally {
      setOptionSaving({ ...optionSaving, [field.name]: false });
    }
  };
  const removeOption = async (field, option) => {
    const label = field.optionLabel ? field.optionLabel(option) : option.name;
    if (!window.confirm(`دسته‌بندی «${label}» حذف شود؟ آیتم‌های گالری حذف نمی‌شوند و بدون دسته‌بندی باقی می‌مانند.`)) return;
    setOptionSaving({ ...optionSaving, [field.name]: true });
    setOptionErrors({ ...optionErrors, [field.name]: "" });
    try {
      await api.delete(`${field.deleteEndpoint}${option.id}/`);
      setOptions({
        ...options,
        [field.name]: (options[field.name] || []).filter(({ id }) => id !== option.id),
      });
      if (String(form[field.name]) === String(option.id)) {
        setForm({ ...form, [field.name]: "" });
      }
      setToast("دسته‌بندی حذف شد؛ آیتم‌های آن بدون دسته‌بندی باقی ماندند.");
    } catch (error) {
      setOptionErrors({ ...optionErrors, [field.name]: firstError(error, "حذف دسته‌بندی انجام نشد") });
    } finally {
      setOptionSaving({ ...optionSaving, [field.name]: false });
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    let body = form;
    if (uploads) {
      body = new FormData();
      Object.entries(form)
        .filter(
          ([name, value]) =>
            !["id", "image_url", "category_name", "created_at"].includes(
              name,
            ) &&
            value !== "" &&
            value !== undefined,
        )
        .forEach(([name, value]) => body.append(name, value));
    }
    try {
      if (form.id) await api.patch(`${endpoint}${form.id}/`, body);
      else await api.post(endpoint, body);
      setOpen(false);
      setForm({});
      resource.reload();
      setToast("با موفقیت ذخیره شد");
    } catch (error) {
      const detail =
        error.response?.data?.detail ||
        Object.values(error.response?.data || {})[0];
      setToast(
        Array.isArray(detail)
          ? detail.join(" ")
          : detail || "ذخیره اطلاعات انجام نشد",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item) => {
    if (!window.confirm("این محتوا حذف شود؟")) return;
    try {
      await api.delete(`${endpoint}${item.id}/`);
      resource.reload();
      setToast("محتوا حذف شد");
    } catch (error) {
      setToast(firstError(error, "حذف محتوا انجام نشد"));
    }
  };
  return (
    <div className="admin-page">
      <Header
        eyebrow={eyebrow}
        title={title}
        action={`افزودن ${type}`}
        onAction={() => setOpen(true)}
      />
      <section className="admin-panel">
        <div className="list-toolbar">
          <div className="admin-list-search"><span aria-hidden="true">⌕</span><input type="search" placeholder={`جست‌وجو در ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="admin-list-search-clear" type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setSearch("")}>×</button>}</div>
          <span>{filteredItems.length} از {resource.data.length} مورد</span>
        </div>
        {resource.loading ? (
          <Skeleton count={6} />
        ) : filteredItems.length ? (
          <div className="entity-list">
            {filteredItems.map((item) => (
              <article key={item.id}>
                <div className="entity-avatar">
                  {entityName(item)[0]}
                </div>
                <div>
                  <b>{entityName(item)}</b>
                  <small>
                    {item.description ||
                      item.specialty ||
                      item.phone ||
                      "اطلاعات تکمیلی ثبت نشده"}
                  </small>
                </div>
                <span>
                  {item.price
                    ? toman(item.price)
                    : item.is_active === false
                      ? "غیرفعال"
                      : "فعال"}
                </span>
                <div className="entity-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(item);
                      setOpen(true);
                    }}
                  >
                    ویرایش
                  </button>
                  {deletable && <button type="button" className="admin-danger" onClick={() => remove(item)}>حذف</button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={search ? "نتیجه‌ای پیدا نشد" : `${title} خالی است`}
            text={search ? "عبارت جست‌وجو را تغییر دهید یا آن را پاک کنید." : `برای شروع، اولین ${type} را اضافه کنید.`}
          />
        )}
      </section>
      {open && (
        <AdminOverlay className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <form
            className="admin-modal admin-entity-form"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="drawer-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="admin-kicker">فرم اطلاعات</span>
            <h2>
              {form.id ? "ویرایش" : "افزودن"} {type}
            </h2>
            {fields.map((definition) => {
              const field = Array.isArray(definition)
                ? {
                    name: definition[0],
                    label: definition[1],
                    type: definition[2],
                  }
                : definition;
              return (
                <label key={field.name} className={field.type === "textarea" || field.type === "file" || field.createEndpoint ? "admin-field-wide" : undefined}>
                  {field.label}
                  {field.type === "select" ? (
                    <>
                      <select
                        value={form[field.name] || ""}
                        onChange={(event) =>
                          setForm({ ...form, [field.name]: event.target.value })
                        }
                      >
                        <option value="">انتخاب کنید</option>
                        {(options[field.name] || field.options || []).map(
                          (option) => (
                            <option
                              key={option.id || option.value}
                              value={option.id || option.value}
                            >
                              {field.optionLabel
                                ? field.optionLabel(option)
                                : option.name ||
                                  option.persian_name ||
                                  option.label ||
                                  `#${option.id}`}
                            </option>
                          ),
                        )}
                      </select>
                      {field.createEndpoint && (
                        <span className="admin-inline-option">
                          <input
                            aria-label="نام دسته‌بندی جدید"
                            placeholder="نام دسته‌بندی جدید"
                            value={optionDrafts[field.name] || ""}
                            onChange={(event) =>
                              setOptionDrafts({
                                ...optionDrafts,
                                [field.name]: event.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            disabled={optionSaving[field.name]}
                            onClick={() => createOption(field)}
                          >
                            {optionSaving[field.name]
                              ? "در حال ذخیره..."
                              : "+ افزودن دسته‌بندی جدید"}
                          </button>
                          {optionErrors[field.name] && (
                            <small className="admin-field-error">
                              {optionErrors[field.name]}
                            </small>
                          )}
                        </span>
                      )}
                      {field.deleteEndpoint && (
                        <details className="admin-category-manager">
                          <summary><span>مدیریت دسته‌بندی‌های گالری</span><small>{(options[field.name] || []).length} دسته‌بندی</small></summary>
                          {(options[field.name] || []).length ? <div className="admin-option-list">
                            {(options[field.name] || []).map((option) => (
                              <span key={option.id}>
                                {field.optionLabel ? field.optionLabel(option) : option.name}
                                <button type="button" className="admin-option-delete" disabled={optionSaving[field.name]} onClick={() => removeOption(field, option)} aria-label={`حذف دسته‌بندی ${option.name}`}>×</button>
                              </span>
                            ))}
                          </div> : <p className="admin-category-empty">هنوز دسته‌بندی‌ای ساخته نشده است.</p>}
                          <p className="admin-category-note">حذف دسته، آیتم‌های گالری را حذف نمی‌کند.</p>
                        </details>
                      )}
                    </>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={form[field.name] || ""}
                      onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={
                        field.type === "file"
                          ? undefined
                          : form[field.name] || ""
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          [field.name]:
                            field.type === "file"
                              ? event.target.files[0]
                              : event.target.value,
                        })
                      }
                    />
                  )}
                </label>
              );
            })}
            <button className="admin-primary" type="submit" disabled={saving}>
              {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </form>
        </AdminOverlay>
      )}
      <Toast
        message={toast}
        type={toast.includes("نشد") ? "error" : "success"}
      />
    </div>
  );
}

const employeeOptionLabel = (user) => user.first_name || user.username;
const appointmentOptionLabel = (appointment) =>
  `${appointment.customer_name || `رزرو #${appointment.id}`} (${appointment.confirmation_code})`;
const scheduleWeekdays = [
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
  "یکشنبه",
];

function EmployeeScheduleModal({ employee, close }) {
  const schedule = useResource(
    `admin/working-schedules/?employee=${employee.id}`,
  );
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!schedule.loading)
      setEntries(
        scheduleWeekdays.map((label, weekday) => {
          const entry = schedule.data.find((item) => item.weekday === weekday);
          return {
            id: entry?.id,
            weekday,
            label,
            start_time: entry?.start_time?.slice(0, 5) || "09:00",
            end_time: entry?.end_time?.slice(0, 5) || "17:00",
            is_active: entry?.is_active ?? false,
          };
        }),
      );
  }, [schedule.data, schedule.loading]);
  const update = (weekday, field, value) =>
    setEntries(
      entries.map((entry) =>
        entry.weekday === weekday ? { ...entry, [field]: value } : entry,
      ),
    );
  const save = async (entry) => {
    const payload = {
      employee: employee.id,
      weekday: entry.weekday,
      start_time: entry.start_time,
      end_time: entry.end_time,
      is_active: entry.is_active,
    };
    try {
      if (entry.id)
        await api.patch(`admin/working-schedules/${entry.id}/`, payload);
      else await api.post("admin/working-schedules/", payload);
      setMessage("ساعات کاری ذخیره شد");
      schedule.reload();
    } catch {
      setMessage("ذخیره ساعات کاری انجام نشد");
    }
  };
  return (
    <AdminOverlay className="modal-backdrop" onMouseDown={close}>
      <section
        className="admin-modal admin-schedule-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="drawer-close" onClick={close}>
          ×
        </button>
        <span className="admin-kicker">برنامه کاری {employee.name}</span>
        <h2>ویرایش ساعات کاری</h2>
        {schedule.loading ? (
          <Skeleton />
        ) : (
          <div className="admin-weekly-schedule">
            {entries.map((entry) => (
              <div className="admin-weekly-schedule-row" key={entry.weekday}>
                <strong>{entry.label}</strong>
                <label>
                  شروع
                  <input
                    aria-label={`شروع ${entry.label}`}
                    type="time"
                    value={entry.start_time}
                    onChange={(event) =>
                      update(entry.weekday, "start_time", event.target.value)
                    }
                  />
                </label>
                <label>
                  پایان
                  <input
                    aria-label={`پایان ${entry.label}`}
                    type="time"
                    value={entry.end_time}
                    onChange={(event) =>
                      update(entry.weekday, "end_time", event.target.value)
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    aria-label={`فعال ${entry.label}`}
                    type="checkbox"
                    checked={entry.is_active}
                    onChange={(event) =>
                      update(entry.weekday, "is_active", event.target.checked)
                    }
                  />{" "}
                  فعال
                </label>
                <button
                  className="admin-primary"
                  type="button"
                  onClick={() => save(entry)}
                >
                  ذخیره
                </button>
              </div>
            ))}
          </div>
        )}
        {message && <small className="admin-schedule-message">{message}</small>}
      </section>
    </AdminOverlay>
  );
}

function EmployeeManagement() {
  const resource = useResource("admin/employees/");
  const eligibleUsers = useResource("admin/employee-eligible-users/");
  const services = useResource("services/");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("new");
  const [editing, setEditing] = useState(null);
  const [scheduleEmployee, setScheduleEmployee] = useState(null);
  const [form, setForm] = useState({ is_active: true });
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const filteredEmployees = useMemo(() => resource.data.filter((employee) => matchesSearch(employee, search)), [resource.data, search]);
  const update = (name, value) => setForm({ ...form, [name]: value });
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    try {
      const body = new FormData();
      Object.entries(form).forEach(([name, value]) => {
        if (name === "services") {
          (Array.isArray(value) ? value : []).forEach((serviceId) =>
            body.append("services", serviceId),
          );
          return;
        }
        if (
          value !== "" &&
          value !== undefined &&
          (mode === "new" || !["username", "password"].includes(name))
        )
          body.append(name, value);
      });
      if (mode === "existing") body.delete("username");
      if (editing) await api.patch(`admin/employees/${editing}/`, body);
      else await api.post("admin/employees/", body);
      setOpen(false);
      setEditing(null);
      setForm({ is_active: true });
      setErrors({});
      resource.reload();
      setToast("کارمند اضافه شد");
    } catch (error) {
      setErrors(error.response?.data || { detail: "ذخیره اطلاعات انجام نشد" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <Header
        eyebrow="تیم سالن"
        title="مدیریت کارمندان"
        action="افزودن کارمند"
        onAction={() => {
          setMode("new");
          setEditing(null);
          setForm({ is_active: true });
          setErrors({});
          setOpen(true);
        }}
      />
      <section className="admin-panel">
        <div className="list-toolbar">
          <div className="admin-list-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="جست‌وجو در کارمندان" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="admin-list-search-clear" type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setSearch("")}>×</button>}</div>
          <span>{filteredEmployees.length} از {resource.data.length} مورد</span>
        </div>
        {resource.loading ? (
          <Skeleton count={6} />
        ) : filteredEmployees.length ? (
          <div className="entity-list">
            {filteredEmployees.map((employee) => (
              <article key={employee.id}>
                <div className="entity-avatar">{(employee.name || "ب")[0]}</div>
                <div>
                  <b>{employee.name}</b>
                </div>
                <span>{employee.is_active ? "فعال" : "غیرفعال"}</span>
                <button
                  onClick={() => {
                    setEditing(employee.id);
                    setForm({
                      ...employee,
                      services: employee.service_ids || [],
                    });
                    setErrors({});
                    setOpen(true);
                  }}
                >
                  ویرایش
                </button>
                <button style={{ width: "100px", padding: "8px", wordBreak: 'none', whiteSpace: 'nowrap' }} onClick={() => setScheduleEmployee(employee)}>
                  ویرایش ساعات کاری
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title={search ? "کارمندی پیدا نشد" : "کارمندی ثبت نشده"} text={search ? "نام، شماره تماس یا تخصص دیگری را جست‌وجو کنید." : undefined} />
        )}
      </section>
      {open && (
        <AdminOverlay className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <form
            className="admin-modal admin-entity-form"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="drawer-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="admin-kicker">
              {editing ? "ویرایش کارمند" : "کارمند جدید"}
            </span>
            <h2>{editing ? "ویرایش کارمند" : "افزودن کارمند"}</h2>
            {!editing && (
              <div className="segmented">
                <button
                  type="button"
                  className={mode === "new" ? "selected" : ""}
                  onClick={() => setMode("new")}
                >
                  حساب جدید
                </button>
                <button
                  type="button"
                  className={mode === "existing" ? "selected" : ""}
                  onClick={() => setMode("existing")}
                >
                  حساب موجود
                </button>
              </div>
            )}
            {!editing && mode === "existing" ? (
              <label>
                حساب متخصص
                <select
                  value={form.user || ""}
                  onChange={(event) => update("user", event.target.value)}
                >
                  <option value="">انتخاب کنید</option>
                  {eligibleUsers.data.map((user) => (
                    <option key={user.id} value={user.id}>
                      {employeeOptionLabel(user)}
                    </option>
                  ))}
                </select>
                {errors.user && (
                  <small className="admin-field-error">{errors.user}</small>
                )}
              </label>
            ) : !editing ? (
              <>
                <label>
                  نام کاربری
                  <input
                    value={form.username || ""}
                    onChange={(event) => update("username", event.target.value)}
                  />
                  {errors.username && (
                    <small className="admin-field-error">
                      {errors.username}
                    </small>
                  )}
                </label>
                <label>
                  رمز عبور
                  <PasswordInput
                    visibilityLabel="رمز عبور کارمند"
                    value={form.password || ""}
                    onChange={(event) => update("password", event.target.value)}
                  />
                  {errors.password && (
                    <small className="admin-field-error">
                      {errors.password}
                    </small>
                  )}
                </label>
              </>
            ) : null}
            <label>
              نام و نام خانوادگی
              <input
                value={form.name || ""}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label>
              شماره تماس
              <input
                type="tel"
                value={form.phone || ""}
                onChange={(event) => update("phone", event.target.value)}
              />
              {errors.phone && (
                <small className="admin-field-error">{errors.phone}</small>
              )}
            </label>
            <label>
              تخصص عمومی
              <input value={form.specialty || ""} onChange={(event) => update("specialty", event.target.value)} />
            </label>
            <label>
              معرفی عمومی متخصص
              <textarea value={form.bio || ""} onChange={(event) => update("bio", event.target.value)} placeholder="متنی که در سایت و مرحله انتخاب متخصص نمایش داده می‌شود" />
            </label>
            <fieldset className="admin-service-picker">
              <legend>سرویس‌های قابل ارائه</legend>
              {services.data
                .filter((service) => service.is_active && service.is_bookable)
                .map((service) => (
                  <label key={service.id} className="check-label">
                    <input
                      type="checkbox"
                      checked={(form.services || [])
                        .map(String)
                        .includes(String(service.id))}
                      onChange={(event) =>
                        update(
                          "services",
                          event.target.checked
                            ? [...(form.services || []), service.id]
                            : (form.services || []).filter(
                                (id) => String(id) !== String(service.id),
                              ),
                        )
                      }
                    />{" "}
                    {service.persian_name || service.name}
                  </label>
                ))}
            </fieldset>
            <label>
              درصد کمیسیون
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.commission_rate || ""}
                onChange={(event) =>
                  update("commission_rate", event.target.value)
                }
              />
              {errors.commission_rate && (
                <small className="admin-field-error">
                  {errors.commission_rate}
                </small>
              )}
            </label>
            <label>
              تصویر پروفایل
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  update("profile_photo", event.target.files[0])
                }
              />
              {errors.profile_photo && (
                <small className="admin-field-error">
                  {errors.profile_photo}
                </small>
              )}
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => update("is_active", event.target.checked)}
              />{" "}
              فعال
            </label>
            {errors.non_field_errors && (
              <small className="admin-field-error">
                {errors.non_field_errors}
              </small>
            )}
            {errors.detail && (
              <small className="admin-field-error">{errors.detail}</small>
            )}
            <button className="admin-primary" type="submit" disabled={saving}>
              {saving
                ? "در حال ذخیره..."
                : editing
                  ? "ذخیره تغییرات"
                  : "ایجاد کارمند"}
            </button>
          </form>
        </AdminOverlay>
      )}
      {scheduleEmployee && (
        <EmployeeScheduleModal
          employee={scheduleEmployee}
          close={() => setScheduleEmployee(null)}
        />
      )}
      <Toast message={toast} type="success" />
    </div>
  );
}
function ServiceManagement() {
  const services = useResource("admin/services/");
  const categories = useResource("admin/service-categories/");
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [form, setForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [imageAlt, setImageAlt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setCategoryOptions(categories.data), [categories.data]);
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const openNew = () => {
    setForm({ category: "", name: "", persian_name: "", short_description: "", description: "", price: "", pricing_type: "FIXED", minimum_price: "", maximum_price: "", pricing_note: "", duration: "", slug: "", seo_title: "", seo_description: "", is_active: true, is_bookable: true, is_featured: false });
    setFiles([]);
    setImageAlt("");
    setCategoryDraft("");
    setCategoryError("");
    setMessage("");
  };
  const createCategory = async () => {
    const name = categoryDraft.trim();
    if (!name) {
      setCategoryError("نام دسته‌بندی را وارد کنید");
      return;
    }
    setCategorySaving(true);
    setCategoryError("");
    try {
      const { data } = await api.post("admin/service-categories/", { name });
      setCategoryOptions((current) => [...current, data]);
      update("category", data.id);
      setCategoryDraft("");
      categories.reload();
    } catch (error) {
      setCategoryError(firstError(error, "ثبت دسته‌بندی انجام نشد"));
    } finally {
      setCategorySaving(false);
    }
  };
  const removeCategory = async (category) => {
    if (!window.confirm(`دسته‌بندی «${category.name}» حذف شود؟ سرویس‌های موجود حذف نمی‌شوند؛ دسته‌های دارای سرویس ابتدا باید خالی شوند.`)) return;
    setCategorySaving(true);
    setCategoryError("");
    try {
      await api.delete(`admin/service-categories/${category.id}/`);
      setCategoryOptions((current) => current.filter((item) => item.id !== category.id));
      if (String(form?.category) === String(category.id)) update("category", "");
      categories.reload();
    } catch (error) {
      setCategoryError(firstError(error, "حذف دسته‌بندی انجام نشد"));
    } finally {
      setCategorySaving(false);
    }
  };
  const uploadImages = async (serviceId) => {
    for (const [index, file] of files.entries()) {
      const body = new FormData();
      body.append("service", serviceId);
      body.append("image", file);
      body.append("alt_text", imageAlt);
      body.append("display_order", index);
      body.append("is_active", "true");
      await api.post("admin/service-images/", body);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const payload = Object.fromEntries(Object.entries(servicePricingPayload(form)).filter(([key]) => !["id", "images", "employees", "category_name", "is_deleted"].includes(key)));
    try {
      const { data } = form.id ? await api.patch(`admin/services/${form.id}/`, payload) : await api.post("admin/services/", payload);
      await uploadImages(data.id);
      setForm(null);
      setFiles([]);
      services.reload();
      setMessage("صفحه سرویس با موفقیت ذخیره شد.");
    } catch (error) {
      setMessage(firstError(error, "ذخیره سرویس انجام نشد"));
    } finally {
      setSaving(false);
    }
  };
  const removeImage = async (imageId) => {
    await api.delete(`admin/service-images/${imageId}/`);
    setForm((current) => ({ ...current, images: current.images.filter((image) => image.id !== imageId) }));
    services.reload();
  };
  return <div className="admin-page service-admin-page">
    <Header eyebrow="کاتالوگ و محتوای عمومی" title="مدیریت سرویس‌ها" action="افزودن سرویس" onAction={openNew} />
    {message && <Toast message={message} type={message.includes("نشد") ? "error" : "success"} />}
    <section className="admin-panel">
      {services.loading ? <Skeleton count={5} /> : <div className="service-admin-list">{services.data.map((service) => <article key={service.id}>
        <div className="service-admin-thumb">{service.images?.[0]?.image_url ? <img src={service.images[0].image_url} alt="" /> : (service.persian_name || "س")[0]}</div>
        <div><b>{service.persian_name || service.name}</b><span>{formatServicePrice(service)}</span><small>{service.short_description || service.description || "محتوای صفحه هنوز کامل نشده است."}</small></div>
        <span className={`finance-badge ${service.is_active ? "paid" : "failed"}`}>{service.is_active ? "منتشرشده" : "غیرفعال"}</span>
        <button className="admin-secondary" onClick={() => { setForm(service); setFiles([]); setImageAlt(""); setCategoryDraft(""); setCategoryError(""); setMessage(""); }}>ویرایش صفحه</button>
      </article>)}</div>}
    </section>
    {form && <AdminOverlay className="modal-backdrop" onMouseDown={() => setForm(null)}><form className="admin-modal service-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="drawer-close" onClick={() => setForm(null)}>×</button>
      <span className="admin-kicker">{form.id ? "ویرایش سرویس" : "سرویس جدید"}</span><h2>{form.persian_name || "محتوای سرویس"}</h2>
      <fieldset><legend>اطلاعات اصلی</legend><div className="service-editor-grid">
        <label>نام فارسی<input required value={form.persian_name || ""} onChange={(event) => update("persian_name", event.target.value)} /></label>
        <label>نام داخلی<input required value={form.name || ""} onChange={(event) => update("name", event.target.value)} /></label>
        <label className="admin-field-wide">دسته‌بندی
          <select required value={form.category || ""} onChange={(event) => update("category", event.target.value)}><option value="">انتخاب کنید</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <span className="admin-inline-option"><input aria-label="نام دسته‌بندی جدید سرویس" placeholder="نام دسته‌بندی جدید" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} /><button type="button" disabled={categorySaving} onClick={createCategory}>{categorySaving ? "در حال ذخیره..." : "+ افزودن دسته‌بندی جدید"}</button>{categoryError && <small className="admin-field-error">{categoryError}</small>}</span>
          <details className="admin-category-manager">
            <summary><span>مدیریت دسته‌بندی‌های سرویس</span><small>{categoryOptions.length} دسته‌بندی</small></summary>
            {categoryOptions.length ? <div className="admin-option-list">{categoryOptions.map((category) => <span key={category.id}>{category.name}<button type="button" className="admin-option-delete" disabled={categorySaving} onClick={() => removeCategory(category)} aria-label={`حذف دسته‌بندی ${category.name}`}>×</button></span>)}</div> : <p className="admin-category-empty">هنوز دسته‌بندی‌ای ساخته نشده است.</p>}
            <p className="admin-category-note">حذف دسته‌بندی‌های دارای سرویس ممکن نیست؛ ابتدا سرویس‌ها را منتقل کنید.</p>
          </details>
        </label>
        <label>نشانی صفحه سرویس<input dir="ltr" value={form.slug || ""} onChange={(event) => update("slug", event.target.value)} /><small>تغییر این مقدار، آدرس عمومی سرویس را تغییر می‌دهد.</small></label>
      </div></fieldset>
      <PanelDisclosure title="محتوای صفحه سرویس"><label>معرفی کوتاه<textarea maxLength="320" value={form.short_description || ""} onChange={(event) => update("short_description", event.target.value)} /></label><label>توضیحات کامل سرویس<textarea className="service-article-input" value={form.description || ""} onChange={(event) => update("description", event.target.value)} /></label></PanelDisclosure>
      <PanelDisclosure title="تصاویر سرویس">{form.images?.length > 0 && <div className="service-image-admin-grid">{form.images.map((image) => <div key={image.id}><img src={image.image_url} alt={image.alt_text || ""} /><span>{image.alt_text || "بدون متن جایگزین"}</span><button type="button" className="admin-danger" onClick={() => removeImage(image.id)}>حذف تصویر</button></div>)}</div>}<label>افزودن تصاویر<input type="file" accept="image/*" multiple onChange={(event) => setFiles([...event.target.files])} /></label><label>توضیح تصاویر جدید<input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="مثلاً نمونه مانیکور در بهارناژ" /></label></PanelDisclosure>
      <ServicePricingFields form={form} onChange={update} />
      <p>قابل رزرو بودن را فقط برای سرویس‌هایی روشن کنید که مشتری می‌تواند وقت آن‌ها را آنلاین بگیرد.</p>
      <PanelDisclosure title="نمایش در گوگل (اختیاری)"><p>عنوان و توضیح کوتاه برای نتیجه جست‌وجو؛ اطلاعات رزرو را تغییر نمی‌دهد.</p><label>عنوان سئو<input value={form.seo_title || ""} onChange={(event) => update("seo_title", event.target.value)} /></label><label>توضیحات سئو<textarea value={form.seo_description || ""} onChange={(event) => update("seo_description", event.target.value)} /></label></PanelDisclosure>
      <fieldset><legend>وضعیت انتشار</legend><div className="service-status-controls"><label><input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => update("is_active", event.target.checked)} /> فعال</label><label><input type="checkbox" checked={Boolean(form.is_bookable)} onChange={(event) => update("is_bookable", event.target.checked)} /> قابل رزرو</label><label><input type="checkbox" checked={Boolean(form.is_featured)} onChange={(event) => update("is_featured", event.target.checked)} /> ویژه</label></div></fieldset>
      {message && <small className="admin-field-error">{message}</small>}<button className="admin-primary" disabled={saving}>{saving ? "در حال ذخیره…" : "ذخیره صفحه سرویس"}</button>
    </form></AdminOverlay>}
  </div>;
}

const paymentLabels = { pending: "در انتظار تأیید", paid: "تأیید شده", failed: "رد شده", refunded: "بازپرداخت شده" };
const appointmentPaymentLabels = { unpaid: "پرداخت‌نشده", partially_paid: "پرداخت جزئی", paid: "تسویه‌شده", partially_refunded: "بازپرداخت جزئی", refunded: "بازپرداخت‌شده" };
const methodLabels = { cash: "نقدی", card: "کارت", bank_transfer: "انتقال بانکی", online: "آنلاین", other: "سایر" };
const transactionLabels = { payment: "پرداخت", refund: "بازپرداخت", commission: "کمیسیون", expense: "هزینه" };
const chartColors = Array.from({ length: 5 }, (_, index) => `var(--color-chart-${index + 1})`);
const financeGroups = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };
const adminChartMetrics = { revenue: "درآمد خالص", payments: "تعداد پرداخت‌ها", appointments: "نوبت‌های تکمیل‌شده", commission: "کمیسیون", average_payment: "میانگین پرداخت" };
const employeeChartMetrics = { revenue: "درآمد خالص", payments: "تعداد پرداخت‌ها", appointments: "نوبت‌های تکمیل‌شده", commission: "کمیسیون", services: "سرویس‌های تکمیل‌شده" };

function financeDate(value) {
  return formatJalaliDate(value, "—");
}

function financeRange(preset, customStart, customEnd) {
  const anchor = new Date(`${today}T12:00:00`);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (preset === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (preset === "month") start.setDate(1);
  if (preset === "last-month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth(), 0, 12);
  }
  if (preset === "custom") return { start: customStart || today, end: customEnd || today };
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

function FinanceChartControls({ grouping, onGrouping, metric, onMetric, metrics = adminChartMetrics }) {
  return <div className="finance-chart-controls">
    <div className="segmented" aria-label="گروه‌بندی نمودار">{Object.entries(financeGroups).map(([value,label]) => <button type="button" key={value} className={grouping === value ? "selected" : ""} onClick={() => onGrouping(value)}>{label}</button>)}</div>
    <label>شاخص<select value={metric} onChange={(event) => onMetric(event.target.value)}>{Object.entries(metrics).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  </div>;
}

function FinanceSeriesChart({ data, metric, metrics = adminChartMetrics, height = 300 }) {
  const monetary = ["revenue", "commission", "average_payment"].includes(metric);
  if (!data?.length) return <Empty title="داده‌ای برای نمودار نیست" />;
  return <ResponsiveContainer width="100%" height={height}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => formatJalaliDate(value)} tick={{ fontSize: "var(--text-caption)", fill: "var(--color-text-secondary)" }} /><YAxis tick={{ fontSize: "var(--text-caption)", fill: "var(--color-text-secondary)" }} /><Tooltip labelFormatter={(value) => formatJalaliDate(value)} formatter={(value) => monetary ? toman(value) : new Intl.NumberFormat("fa-IR").format(value)} /><Bar name={metrics[metric]} dataKey={metric} fill="var(--color-chart-1)" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
}

function FinancePresetFilter({ preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd }) {
  return <div className="finance-modal-range">
    <div className="segmented">{[["day","امروز"],["week","این هفته"],["month","این ماه"],["last-month","ماه قبل"],["custom","بازه دلخواه"]].map(([value,label]) => <button type="button" key={value} className={preset === value ? "selected" : ""} onClick={() => setPreset(value)}>{label}</button>)}</div>
    {preset === "custom" && <div className="finance-custom-range"><label>از<JalaliDatePicker value={customStart} onChange={setCustomStart} minDate="" /></label><label>تا<JalaliDatePicker value={customEnd} onChange={setCustomEnd} minDate="" /></label></div>}
  </div>;
}

function EmployeeFinanceModal({ employee, onClose }) {
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [grouping, setGrouping] = useState("daily");
  const [metric, setMetric] = useState("revenue");
  const range = useMemo(() => financeRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const report = useResource(`admin/employees/${employee.id}/finance/?period=custom&start_date=${range.start}&end_date=${range.end}&group_by=${grouping}`);
  const data = report.data && !Array.isArray(report.data) ? report.data : {};
  const profile = data.employee || employee;
  return <AdminOverlay className="modal-backdrop employee-finance-backdrop" onMouseDown={onClose}><section className="admin-modal employee-finance-modal" role="dialog" aria-modal="true" aria-labelledby="employee-finance-title" onMouseDown={(event) => event.stopPropagation()}>
    <button type="button" className="drawer-close" onClick={onClose}>×</button>
    <header className="employee-finance-profile">{profile.profile_photo_url ? <img src={profile.profile_photo_url} alt={`تصویر ${profile.name}`} /> : <span>{profile.name?.[0] || "م"}</span>}<div><small>گزارش مالی متخصص</small><h2 id="employee-finance-title">{profile.name}</h2><p>{profile.specialty || "متخصص بهارناژ"}</p></div></header>
    <FinancePresetFilter {...{ preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd }} />
    {report.loading ? <Skeleton /> : report.error ? <Empty title="دریافت گزارش مالی انجام نشد" /> : <>
      <div className="employee-finance-stats"><Stat label="درآمد تأییدشده" value={toman(data.received || 0)} note={`خالص: ${toman(data.net_revenue || 0)}`} accent /><Stat label="کمیسیون" value={toman(data.commission_total || 0)} note="مجزا از درآمد سالن" /><Stat label="سرویس تکمیل‌شده" value={new Intl.NumberFormat("fa-IR").format(data.completed_services || 0)} note={`${data.completed_appointments || 0} نوبت`} /><Stat label="میانگین پرداخت" value={toman(data.average_payment || 0)} note={`${data.payments_count || 0} پرداخت`} /><Stat label="گزارش در انتظار" value={toman(data.pending_reports || 0)} note="نیازمند بررسی" /><Stat label="مانده منتسب" value={toman(data.outstanding || 0)} note={`بازپرداخت: ${toman(data.refunded || 0)}`} /></div>
      <section className="admin-panel finance-chart employee-modal-chart"><div className="panel-title"><div><span>روند عملکرد</span><h3>{employeeChartMetrics[metric]}</h3></div></div><FinanceChartControls grouping={grouping} onGrouping={setGrouping} metric={metric} onMetric={setMetric} metrics={employeeChartMetrics} /><FinanceSeriesChart data={data.series} metric={metric} metrics={employeeChartMetrics} height={270} /></section>
      <div className="employee-finance-detail-grid">
        <section><h3>پرداخت‌ها</h3>{data.payments?.length ? data.payments.map((item) => <article key={item.id}><b>{toman(item.employee_amount)}</b><span>{item.customer} · {item.services?.join("، ")}</span><small>{financeDate(item.date)} · {paymentLabels[item.status] || item.status} · مبلغ کل پرداخت {toman(item.amount)}</small></article>) : <Empty />}</section>
        <section><h3>تراکنش‌ها</h3>{data.transactions?.length ? data.transactions.map((item) => <article key={item.id}><b>{transactionLabels[item.type] || item.type} · {toman(item.employee_amount)}</b><span>{item.customer} · {item.services?.join("، ")}</span><small>{financeDate(item.date)} · نوبت #{item.appointment}</small></article>) : <Empty />}</section>
        <section><h3>نوبت‌ها</h3>{data.appointments?.length ? data.appointments.map((item) => <article key={item.id}><b>#{item.id} · {item.customer}</b><span>{item.services?.join("، ")}</span><small>{financeDate(item.date)} · {labels[item.status] || item.status} · {appointmentPaymentLabels[item.payment_status] || item.payment_status}</small></article>) : <Empty />}</section>
        <section><h3>سرویس‌های انجام‌شده</h3>{data.services_performed?.length ? data.services_performed.map((item) => <article key={item.id}><b>{item.service} · {toman(item.amount)}</b><span>{item.customer} · کمیسیون {toman(item.commission)}</span><small>{financeDate(item.date)} · {labels[item.status] || item.status} · {appointmentPaymentLabels[item.payment_status] || item.payment_status}</small></article>) : <Empty />}</section>
      </div>
    </>}
  </section></AdminOverlay>;
}

function Finance() {
  const employees = useResource("admin/employees/");
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [employee, setEmployee] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [chartGrouping, setChartGrouping] = useState("daily");
  const [chartMetric, setChartMetric] = useState("revenue");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ appointment: "", amount: "", payment_method: "cash", notes: "" });
  const [refund, setRefund] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const range = useMemo(() => financeRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const baseQuery = new URLSearchParams({ start_date: range.start, end_date: range.end, ...(employee && { employee }) });
  const paymentQuery = new URLSearchParams({ ...Object.fromEntries(baseQuery), ...(statusFilter && { status: statusFilter }), ...(methodFilter && { payment_method: methodFilter }), ...(search && { q: search }) });
  const payments = useResource(`admin/payments/?${paymentQuery}`);
  const transactions = useResource(`admin/transactions/?${baseQuery}`);
  const commissions = useResource(`admin/commissions/?${baseQuery}`);
  const overview = useResource(`admin/revenue/?period=custom&group_by=${chartGrouping}&${baseQuery}`);
  const appointments = useResource(`admin/appointments/?start_date=${range.start}&end_date=${range.end}${employee ? `&employee=${employee}` : ""}`);
  const refresh = () => { payments.reload(); transactions.reload(); commissions.reload(); overview.reload(); };
  const reviewPayment = async (payment, action) => {
    setBusy(true); setMessage("");
    try { const { data } = await api.post(`admin/payments/${payment.id}/${action}/`); setSelected(data); refresh(); }
    catch (error) { setMessage(firstError(error, "بررسی پرداخت انجام نشد")); }
    finally { setBusy(false); }
  };
  const createPayment = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api.post("admin/payments/", { ...manual, amount: Number(manual.amount) }); setManualOpen(false); setManual({ appointment: "", amount: "", payment_method: "cash", notes: "" }); setMessage("پرداخت دستی ثبت شد."); refresh(); }
    catch (error) { setMessage(firstError(error, "ثبت پرداخت انجام نشد")); }
    finally { setBusy(false); }
  };
  const createRefund = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api.post("admin/refunds/", { payment: selected.id, amount: Number(refund.amount), reason: refund.reason }); setRefund({ amount: "", reason: "" }); setSelected(null); setMessage("بازپرداخت در سابقه پرداخت ثبت شد."); refresh(); }
    catch (error) { setMessage(firstError(error, "ثبت بازپرداخت انجام نشد")); }
    finally { setBusy(false); }
  };
  const metrics = overview.data && !Array.isArray(overview.data) ? overview.data : {};
  return <div className="admin-page finance-page">
    <Header eyebrow="گزارش‌های قابل حسابرسی" title="مالی و پرداخت‌ها" action="ثبت پرداخت دستی" onAction={() => setManualOpen(true)} />
    <div className="finance-filters">
      <div className="segmented">{[["day","امروز"],["week","این هفته"],["month","این ماه"],["last-month","ماه قبل"],["custom","بازه دلخواه"]].map(([value,label]) => <button key={value} className={preset === value ? "selected" : ""} onClick={() => setPreset(value)}>{label}</button>)}</div>
      {preset === "custom" && <div className="finance-custom-range"><label>از<JalaliDatePicker value={customStart} onChange={setCustomStart} minDate="" /></label><label>تا<JalaliDatePicker value={customEnd} onChange={setCustomEnd} minDate="" /></label></div>}
      <select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">همه کارکنان</option>{employees.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    {overview.error && <div className="finance-message error">دریافت آمار مالی انجام نشد.</div>}
    {message && <div className="finance-message">{message}</div>}
    <div className="finance-stat-grid">
      <Stat label="پرداخت‌های تأییدشده" value={toman(metrics.received || 0)} note="دریافتی ناخالص" accent />
      <Stat label="گزارش در انتظار" value={toman(metrics.pending_reports || 0)} note="نیازمند بررسی مدیریت" />
      <Stat label="مانده نوبت‌ها" value={toman(metrics.outstanding || 0)} note="پرداخت‌نشده در بازه" />
    </div>
    <section className="admin-panel finance-table-panel"><div className="panel-title"><div><span>پرداخت‌ها</span><h2>سوابق و گزارش‌های پرداخت</h2></div></div><div className="finance-table-filters"><input aria-label="جست‌وجوی پرداخت" placeholder="جست‌وجوی مشتری، نوبت یا توضیح" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="وضعیت پرداخت" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(paymentLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="روش پرداخت" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">همه روش‌ها</option>{Object.entries(methodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>{payments.loading ? <Skeleton /> : payments.data.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>تاریخ</th><th>مشتری / نوبت</th><th>گزارش‌دهنده</th><th>مبلغ</th><th>روش</th><th>وضعیت</th><th></th></tr></thead><tbody>{payments.data.map((item) => <tr key={item.id} className={item.status}><td>{financeDate(item.created_at)}</td><td><b>{item.customer_name || "مشتری"}</b><small>نوبت #{item.appointment}</small></td><td>{item.reporter_name || "مدیریت"}</td><td>{toman(item.amount)}</td><td>{methodLabels[item.payment_method]}</td><td><span className={`finance-badge ${item.status}`}>{paymentLabels[item.status]}</span></td><td><button className="admin-ghost" onClick={() => setSelected(item)}>جزئیات</button></td></tr>)}</tbody></table></div> : <Empty />}</section>
    <PanelDisclosure title="درآمد خالص، ارزش سرویس‌ها و کمیسیون"><div className="finance-stat-grid">
      <Stat label="درآمد خالص" value={toman(metrics.net_revenue || 0)} note={`پس از ${toman(metrics.refunded || 0)} بازپرداخت`} />
      <Stat label="ارزش سرویس‌های تکمیل‌شده" value={toman(metrics.service_revenue || 0)} note="درآمد مشارکتی سرویس‌ها" />
      <Stat label="کمیسیون کارکنان" value={toman(metrics.commission_total || 0)} note="مجزا از درآمد سالن" />
    </div></PanelDisclosure>
    <PanelDisclosure title="نمودار درآمد و سهم سرویس‌ها">
    <div className="finance-chart-grid">
      <section className="admin-panel finance-chart"><div className="panel-title"><div><span>روند زمانی</span><h2>{adminChartMetrics[chartMetric]}</h2></div></div><FinanceChartControls grouping={chartGrouping} onGrouping={setChartGrouping} metric={chartMetric} onMetric={setChartMetric} /><FinanceSeriesChart data={metrics.series} metric={chartMetric} /></section>
      <section className="admin-panel finance-chart service-performance"><div className="panel-title"><div><span>بر پایه پرداخت تأییدشده</span><h2>سهم سرویس‌های پردرآمد</h2></div></div>{metrics.services?.length ? <><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={metrics.services} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>{metrics.services.map((entry,index) => <Cell key={entry.id} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => toman(value)} /></PieChart></ResponsiveContainer><div className="service-performance-legend">{metrics.services.slice(0,5).map((item,index) => <div key={item.id}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{item.name}<small>{new Intl.NumberFormat("fa-IR").format(item.paid_services)} سرویس پرداخت‌شده</small></span><b>{new Intl.NumberFormat("fa-IR").format(item.share)}٪</b></div>)}</div></> : <Empty title="سرویس پرداخت‌شده‌ای نیست" />}</section>
    </div>
    </PanelDisclosure>
    <section className="admin-panel finance-employees"><div className="panel-title"><div><span>تفکیک عملکرد</span><h2>درآمد تأییدشده و کمیسیون کارکنان</h2></div></div><div className="finance-employee-grid">{metrics.employees?.map((item) => <button type="button" className="finance-employee-card" key={item.id} onClick={() => setSelectedEmployee(item)}>{item.profile_photo_url ? <img src={item.profile_photo_url} alt="" /> : <i>{item.name?.[0] || "م"}</i>}<span><b>{item.name}</b><small>{new Intl.NumberFormat("fa-IR").format(item.completed_services)} سرویس · {item.payments} پرداخت</small></span><strong>{toman(item.confirmed_revenue)}</strong><small>کمیسیون: {toman(item.commission)}</small></button>)}</div>{!metrics.employees?.length && <Empty />}</section>

    <PanelDisclosure title="سوابق تراکنش‌ها و کمیسیون‌ها">    <div className="admin-grid-two"><section className="admin-panel"><div className="panel-title"><div><span>سوابق مالی</span><h2>آخرین تراکنش‌ها</h2></div></div><div className="finance-ledger">{transactions.data.slice(0,8).map((item) => <div key={item.id}><span className={`finance-badge ${item.type}`}>{transactionLabels[item.type] || item.type}</span><b>{toman(item.amount)}</b><small>{item.customer_name || item.description || `نوبت #${item.appointment}`}</small></div>)}</div></section><section className="admin-panel"><div className="panel-title"><div><span>کارکنان</span><h2>آخرین کمیسیون‌ها</h2></div></div><div className="finance-ledger">{commissions.data.slice(0,8).map((item) => <div key={item.id}><span>{item.employee_name}</span><b>{toman(item.commission_amount)}</b><small>{item.service_name} · {item.status}</small></div>)}</div></section></div></PanelDisclosure>
    {selected && <AdminOverlay className="drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="admin-drawer finance-detail" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelected(null)}>×</button><span className="admin-kicker">پرداخت #{selected.id}</span><h2>{toman(selected.amount)}</h2><div className="finance-detail-summary"><span className={`finance-badge ${selected.status}`}>{paymentLabels[selected.status]}</span><p>نوبت #{selected.appointment} · {selected.customer_name || "مشتری"}</p><p>روش: {methodLabels[selected.payment_method]} · گزارش‌دهنده: {selected.reporter_name || "مدیریت"}</p>{selected.reviewed_by_name && <p>بررسی‌کننده: {selected.reviewed_by_name}</p>}</div><section><h3>سرویس‌ها و متخصصان</h3>{selected.appointment_items?.map((item) => <div className="finance-detail-line" key={item.id}><b>{item.service}</b><span>{item.employee}</span></div>)}</section>{selected.notes && <section><h3>یادداشت</h3><p>{selected.notes}</p></section>}{selected.refunds?.length > 0 && <section><h3>بازپرداخت‌های ثبت‌شده</h3>{selected.refunds.map((item) => <div className="finance-detail-line" key={item.id}><b>{toman(item.amount)}</b><span>{item.reason || "بدون توضیح"}</span></div>)}</section>}{selected.has_unresolved_prices && <p className="pricing-warning">قیمت برخی سرویس‌ها نهایی نشده است. پیش از تأیید پرداخت، قیمت نهایی نوبت را ثبت کنید.</p>}{selected.status === "pending" && <div className="finance-review-actions"><button className="admin-success" disabled={busy || selected.has_unresolved_prices} onClick={() => reviewPayment(selected,"confirm")}>تأیید گزارش</button><button className="admin-danger" disabled={busy} onClick={() => reviewPayment(selected,"reject")}>رد گزارش</button></div>}{["paid","refunded"].includes(selected.status) && selected.refundable_total > 0 && <form className="finance-refund-form" onSubmit={createRefund}><h3>ثبت بازپرداخت</h3><label>مبلغ<input required type="number" min="1" max={selected.refundable_total} value={refund.amount} onChange={(event) => setRefund({ ...refund, amount: event.target.value })} /></label><label>دلیل<textarea value={refund.reason} onChange={(event) => setRefund({ ...refund, reason: event.target.value })} /></label><button className="admin-danger" disabled={busy}>ثبت بازپرداخت</button></form>}</aside></AdminOverlay>}
    {manualOpen && <AdminOverlay className="modal-backdrop" onMouseDown={() => setManualOpen(false)}><form className="admin-modal" onSubmit={createPayment} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="drawer-close" onClick={() => setManualOpen(false)}>×</button><span className="admin-kicker">ثبت توسط مدیریت</span><h2>پرداخت دستی</h2><label>نوبت<select required value={manual.appointment} onChange={(event) => setManual({ ...manual, appointment: event.target.value })}><option value="">انتخاب نوبت</option>{appointments.data.filter((item) => item.remaining_total > 0 && !item.has_unresolved_prices && item.status !== "cancelled").map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.customer_name} · مانده {toman(item.remaining_total)}</option>)}</select></label><label>مبلغ<input required min="1" type="number" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} /></label><label>روش<select value={manual.payment_method} onChange={(event) => setManual({ ...manual, payment_method: event.target.value })}>{Object.entries(methodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>یادداشت<textarea value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></label><button className="admin-primary" disabled={busy}>ثبت پرداخت</button></form></AdminOverlay>}
    {selectedEmployee && <EmployeeFinanceModal employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />}
  </div>;
}
function Content() {
  return (
    <CrudPage
      type="بخش محتوا"
      endpoint="admin/gallery/"
      title="محتوا و گالری"
      eyebrow="انتشارات"
      uploads
      deletable
      fields={[
        ["title", "عنوان"],
        {
          name: "category",
          label: "دسته‌بندی",
          type: "select",
          optionsEndpoint: "admin/gallery-categories/",
          createEndpoint: "admin/gallery-categories/",
          deleteEndpoint: "admin/gallery-categories/",
        },
        ["image", "تصویر", "file"],
        ["description", "توضیحات"],
        ["display_order", "ترتیب نمایش", "number"],
      ]}
    />
  );
}
const closureKinds = {
  holiday: "تعطیلی",
  maintenance: "تعمیرات",
  private_event: "مراسم خصوصی",
  other: "سایر",
};

function SalonClosures() {
  const closures = useResource("admin/closures/");
  const [form, setForm] = useState({ start_date: today, end_date: today, kind: "holiday", reason: "" });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const reset = () => {
    setForm({ start_date: today, end_date: today, kind: "holiday", reason: "" });
    setEditing(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      if (editing) await api.patch(`admin/closures/${editing}/`, form);
      else await api.post("admin/closures/", form);
      setMessage(editing ? "روز تعطیل ویرایش شد." : "روز تعطیل ثبت شد.");
      reset();
      closures.reload();
    } catch (error) {
      setMessage(firstError(error, "ثبت روز تعطیل انجام نشد."));
    } finally {
      setSaving(false);
    }
  };
  const beginEdit = (item) => {
    setEditing(item.id);
    setForm({ start_date: item.start_date, end_date: item.end_date, kind: item.kind, reason: item.reason || "" });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async () => {
    try {
      await api.delete(`admin/closures/${deleting.id}/`);
      setDeleting(null);
      setMessage("روز تعطیل حذف شد.");
      closures.reload();
    } catch (error) {
      setMessage(firstError(error, "حذف روز تعطیل انجام نشد."));
    }
  };
  return <div className="admin-page salon-closures-page">
    <Header eyebrow="کنترل ظرفیت سالن" title="روزهای تعطیل" />
    <p className="admin-page-description">در این بازه‌ها هیچ مشتری نمی‌تواند نوبت تازه بگیرد و روز در تقویم رزرو با وضعیت تعطیل نمایش داده می‌شود.</p>
    {message && <Toast message={message} type={message.includes("نشد") || message.includes("هم‌پوشانی") ? "error" : "success"} />}
    <section className="admin-panel closure-form-panel">
      <div className="panel-title"><div><span>{editing ? "ویرایش" : "ثبت جدید"}</span><h2>{editing ? "ویرایش بازه تعطیلی" : "افزودن روز یا بازه تعطیل"}</h2></div></div>
      <form className="closure-form" onSubmit={submit}>
        <label>از تاریخ<JalaliDatePicker value={form.start_date} onChange={(start_date) => setForm((current) => ({ ...current, start_date, end_date: current.end_date < start_date ? start_date : current.end_date }))} minDate="" /></label>
        <label>تا تاریخ<JalaliDatePicker value={form.end_date} onChange={(end_date) => setForm((current) => ({ ...current, end_date }))} minDate={form.start_date} /></label>
        <label>نوع تعطیلی<select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}>{Object.entries(closureKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="closure-reason">توضیح برای مشتری <small>(اختیاری)</small><input value={form.reason} maxLength={255} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="مثلاً تعطیلات رسمی یا تکمیل ظرفیت" /></label>
        <div className="closure-form-actions"><button className="admin-primary" disabled={saving}>{saving ? "در حال ثبت..." : editing ? "ذخیره تغییرات" : "ثبت تعطیلی"}</button>{editing && <button type="button" className="admin-secondary" onClick={reset}>انصراف</button>}</div>
      </form>
    </section>
    <section className="admin-panel">
      <div className="panel-title"><div><span>تقویم سالن</span><h2>تعطیلی‌های ثبت‌شده</h2></div><b>{new Intl.NumberFormat("fa-IR").format(closures.data.length)} مورد</b></div>
      {closures.loading ? <Skeleton /> : closures.data.length ? <div className="closure-list">{closures.data.map((item) => <article key={item.id}>
        <span className="closure-date"><b>{formatJalaliDate(item.start_date)}</b>{item.end_date !== item.start_date && <small>تا {formatJalaliDate(item.end_date)}</small>}</span>
        <span><b>{closureKinds[item.kind] || "تعطیلی"}</b><small>{item.reason || "بدون توضیح"}</small></span>
        <div><button className="admin-ghost" onClick={() => beginEdit(item)}>ویرایش</button><button className="admin-danger" onClick={() => setDeleting(item)}>حذف</button></div>
      </article>)}</div> : <Empty title="روز تعطیلی ثبت نشده" text="سالن در تمام روزهای دارای برنامه کاری قابل رزرو است." />}
    </section>
    {deleting && <AdminOverlay className="modal-backdrop" onMouseDown={() => setDeleting(null)}><section className="admin-modal closure-delete-modal" role="dialog" aria-modal="true" aria-labelledby="closure-delete-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="بستن" onClick={() => setDeleting(null)}>×</button><span className="admin-kicker">حذف تعطیلی</span><h2 id="closure-delete-title">این روز دوباره قابل رزرو شود؟</h2><p>{formatJalaliDate(deleting.start_date)}{deleting.end_date !== deleting.start_date ? ` تا ${formatJalaliDate(deleting.end_date)}` : ""}</p><div className="drawer-actions"><button className="admin-danger" onClick={remove}>حذف تعطیلی</button><button className="admin-secondary" onClick={() => setDeleting(null)}>انصراف</button></div></section></AdminOverlay>}
  </div>;
}

const leaveStatusLabels = { pending: "در انتظار", approved: "تأیید شده", rejected: "رد شده", withdrawn: "پس‌گرفته شده" };

function TimeOffManagement() {
  const requests = useResource("admin/time-off/");
  const [selected, setSelected] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (action) => {
    setBusy(true); setMessage("");
    try {
      await api.post(`admin/time-off/${selected.id}/${action}/`, { review_notes: reviewNotes });
      setMessage(action === "approve" ? "مرخصی تأیید و در برنامه اعمال شد." : "درخواست مرخصی رد شد.");
      setSelected(null); setReviewNotes(""); requests.reload();
    } catch (error) {
      setMessage(firstError(error, "بررسی درخواست انجام نشد."));
    } finally { setBusy(false); }
  };
  const pending = requests.data.filter((item) => item.status === "pending");
  const reviewed = requests.data.filter((item) => item.status !== "pending");
  const rows = (items) => <div className="leave-request-list">{items.map((item) => <article key={item.id}>
    <span className="entity-avatar">{item.employee_name?.[0] || "ک"}</span>
    <span><b>{item.employee_name || "کارمند"}</b><small>{formatJalaliDate(item.start_date)} تا {formatJalaliDate(item.end_date)} · {item.reason || "بدون توضیح"}</small></span>
    <em className={`status ${item.status}`}>{leaveStatusLabels[item.status]}</em>
    {item.status === "pending" ? <button className="admin-primary" onClick={() => { setSelected(item); setReviewNotes(""); }}>بررسی</button> : <small>{item.review_notes || "بدون یادداشت مدیر"}</small>}
  </article>)}</div>;
  return <div className="admin-page">
    <Header eyebrow="برنامه کارکنان" title="درخواست‌های مرخصی" />
    <p className="admin-page-description">درخواست تا زمان تأیید مدیر، ساعت‌های قابل رزرو کارمند را مسدود نمی‌کند.</p>
    {message && <Toast message={message} type={message.includes("نشد") || message.includes("نوبت فعال") ? "error" : "success"} />}
    <section className="admin-panel"><div className="panel-title"><div><span>نیازمند اقدام</span><h2>در انتظار بررسی</h2></div><b>{new Intl.NumberFormat("fa-IR").format(pending.length)} درخواست</b></div>{requests.loading ? <Skeleton /> : pending.length ? rows(pending) : <Empty title="درخواست بازی وجود ندارد" />}</section>
    <section className="admin-panel"><div className="panel-title"><div><span>سابقه</span><h2>درخواست‌های بررسی‌شده</h2></div></div>{reviewed.length ? rows(reviewed) : <Empty title="سابقه‌ای وجود ندارد" />}</section>
    {selected && <AdminOverlay className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="leave-review-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="بستن" onClick={() => setSelected(null)}>×</button><span className="admin-kicker">بررسی مرخصی</span><h2 id="leave-review-title">{selected.employee_name}</h2><p>{formatJalaliDate(selected.start_date)} تا {formatJalaliDate(selected.end_date)}</p><p>{selected.reason || "دلیلی ثبت نشده است."}</p><label>یادداشت برای کارمند<textarea value={reviewNotes} maxLength={500} onChange={(event) => setReviewNotes(event.target.value)} /></label><div className="drawer-actions"><button className="admin-success" disabled={busy} onClick={() => review("approve")}>تأیید مرخصی</button><button className="admin-danger" disabled={busy} onClick={() => review("reject")}>رد درخواست</button></div></section></AdminOverlay>}
  </div>;
}

function CustomerManagement() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const customerEndpoint = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (appliedSearch) params.set("q", appliedSearch);
    if (accountFilter) params.set("account", accountFilter);
    if (conflictsOnly) params.set("identity_conflict", "1");
    return `admin/customers/?${params}`;
  }, [page, appliedSearch, accountFilter, conflictsOnly]);
  const customers = useResource(customerEndpoint);
  const deletions = useResource("admin/deletion-requests/");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({ notes: "", tags: "", neighborhood: "", service_preferences: "", no_show_count: 0 });
  const [selectedDeletion, setSelectedDeletion] = useState(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const conflictGroups = Object.values((customers.data || []).filter((item) => item.identity_conflict && item.normalized_phone).reduce((groups, item) => ({ ...groups, [item.normalized_phone]: [...(groups[item.normalized_phone] || []), item] }), {}));
  const openCustomer = (item) => {
    setSelectedCustomer(item);
    setCustomerForm({ notes: item.notes || "", tags: item.tags || "", neighborhood: item.neighborhood || "", service_preferences: item.service_preferences || "", no_show_count: item.no_show_count || 0 });
  };
  const saveCustomer = async (event) => {
    event.preventDefault(); setMessage("");
    try {
      const { data } = await api.patch(`admin/customers/${selectedCustomer.id}/`, customerForm);
      setSelectedCustomer(data); setMessage("اطلاعات داخلی مشتری ذخیره شد."); customers.reload();
    } catch (error) { setMessage(firstError(error, "ذخیره اطلاعات مشتری انجام نشد.")); }
  };
  const decide = async (action) => {
    setMessage("");
    try {
      await api.post(`admin/deletion-requests/${selectedDeletion.id}/${action}/`, { notes });
      setSelectedDeletion(null); setNotes(""); deletions.reload();
    } catch (error) { setMessage(firstError(error, "پردازش درخواست انجام نشد.")); }
  };
  const mergeIdentity = async (canonical, legacy) => {
    setMessage("");
    try {
      await api.post(`admin/customers/${canonical.id}/resolve-identity/`, { legacy_user_id: legacy.user_id });
      setMessage("سوابق مشتری ادغام شد."); customers.reload();
    } catch (error) { setMessage(firstError(error, "ادغام سوابق انجام نشد.")); }
  };
  return <div className="admin-page"><Header eyebrow="ارتباط با مشتری" title="مدیریت مشتریان" />
    {message && <Toast message={message} type={message.includes("نشد") ? "error" : "success"} />}
    <section className="admin-panel customer-directory"><div className="panel-title"><div><span>پرونده مشتری</span><h2>مشتریان و مهمان‌ها</h2></div><b>{new Intl.NumberFormat("fa-IR").format(customers.count)} نفر</b></div>
      <form className="customer-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}><input aria-label="جستجوی مشتری" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام، موبایل یا ایمیل" /><select aria-label="نوع حساب" value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setPage(1); }}><option value="">همه مشتریان</option><option value="account">حساب فعال</option><option value="guest">مهمان</option></select><label className="check-label"><input type="checkbox" checked={conflictsOnly} onChange={(event) => { setConflictsOnly(event.target.checked); setPage(1); }} /> فقط تعارض هویت</label><button className="admin-primary">جستجو</button></form>
      {customers.loading ? <Skeleton /> : customers.error ? <Empty title="دریافت مشتریان انجام نشد" text="دوباره تلاش کنید." /> : customers.data.length ? <div className="customer-list">{customers.data.map((item) => <button type="button" key={item.id} onClick={() => openCustomer(item)}>
        <span className="entity-avatar">{item.name?.[0] || "م"}</span><span><b>{item.name}</b><small>{item.phone || "بدون شماره"} · {item.is_guest ? "مهمان" : "حساب مشتری"}{item.identity_conflict ? " · تعارض هویت" : ""}</small></span><span><small>نوبت بعدی</small><b>{formatJalaliDate(item.upcoming_visit, "ندارد")}</b></span><span><small>آخرین مراجعه</small><b>{formatJalaliDate(item.previous_visit, "ندارد")}</b></span><span><small>پرداخت تأییدشده</small><b>{toman(item.total_spending)}</b></span>
      </button>)}</div> : <Empty title="مشتری پیدا نشد" text="فیلتر یا عبارت جستجو را تغییر دهید." />}
      <div className="customer-pagination"><button className="admin-secondary" disabled={!customers.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}>صفحه قبل</button><span>صفحه {new Intl.NumberFormat("fa-IR").format(page)}</span><button className="admin-secondary" disabled={!customers.next} onClick={() => setPage((value) => value + 1)}>صفحه بعد</button></div>
    </section>
    {conflictGroups.length > 0 && <section className="admin-panel"><div className="panel-title"><div><span>نیازمند بررسی</span><h2>تعارض هویت مشتریان</h2></div></div>{conflictGroups.map((group) => { const canonical = group.find((item) => !item.is_guest) || group[0]; return <div className="identity-conflict" key={canonical.normalized_phone}><div><b>{canonical.normalized_phone}</b><small>{group.length} رکورد با این شماره</small></div>{group.filter((item) => item.id !== canonical.id).map((legacy) => <button className="admin-secondary" key={legacy.id} onClick={() => mergeIdentity(canonical, legacy)}>ادغام {legacy.name} در حساب اصلی</button>)}</div>; })}</section>}
    <section className="admin-panel"><div className="panel-title"><div><span>حریم خصوصی</span><h2>درخواست‌های حذف حساب</h2></div></div>{deletions.loading ? <Skeleton /> : deletions.data.length ? <div className="entity-list">{deletions.data.map((item) => <article key={item.id}><span className="entity-avatar">×</span><span><b>{item.customer_name || "مشتری"}</b><small>{item.customer_phone || "شماره حذف شده"} · {formatJalaliDateTime(item.requested_at)} · {{pending:"در انتظار",approved:"تأیید اولیه",rejected:"رد شده",completed:"تکمیل شده",cancelled:"لغو مشتری"}[item.status]}</small></span>{["pending","approved"].includes(item.status) && <button className="admin-ghost" onClick={() => { setSelectedDeletion(item); setNotes(""); }}>بررسی</button>}</article>)}</div> : <Empty title="درخواست حذفی ثبت نشده" />}</section>
    {selectedCustomer && <AdminOverlay className="drawer-backdrop" onMouseDown={() => setSelectedCustomer(null)}><aside className="admin-drawer customer-drawer" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="بستن" onClick={() => setSelectedCustomer(null)}>×</button><span className="admin-kicker">پرونده مشتری</span><h2>{selectedCustomer.name}</h2><p className="drawer-meta">{selectedCustomer.phone || "بدون شماره"} · {selectedCustomer.is_guest ? "مهمان" : "حساب ورود"}</p><div className="customer-metrics"><span><small>کل نوبت‌ها</small><b>{new Intl.NumberFormat("fa-IR").format(selectedCustomer.appointment_count)}</b></span><span><small>پرداخت تأییدشده</small><b>{toman(selectedCustomer.total_spending)}</b></span><span><small>عدم حضور</small><b>{new Intl.NumberFormat("fa-IR").format(selectedCustomer.no_show_count)}</b></span></div><div className="drawer-section"><h3>رفتار و ترجیحات</h3><p>یادآوری عملیاتی: {selectedCustomer.preferences?.operational_reminders ? "فعال" : "غیرفعال"} · پیام تبلیغاتی: {selectedCustomer.preferences?.promotional_messages ? "فعال" : "غیرفعال"}</p></div><form className="customer-notes-form" onSubmit={saveCustomer}><label>محله<input value={customerForm.neighborhood} onChange={(event) => setCustomerForm({ ...customerForm, neighborhood: event.target.value })} /></label><label>ترجیحات سرویس‌ها<textarea value={customerForm.service_preferences} onChange={(event) => setCustomerForm({ ...customerForm, service_preferences: event.target.value })} /></label><label>یادداشت داخلی<textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} /></label><label>برچسب‌ها<input value={customerForm.tags} onChange={(event) => setCustomerForm({ ...customerForm, tags: event.target.value })} /></label><label>تعداد عدم حضور<input type="number" min="0" value={customerForm.no_show_count} onChange={(event) => setCustomerForm({ ...customerForm, no_show_count: Number(event.target.value) })} /></label><button className="admin-primary">ذخیره پرونده</button></form></aside></AdminOverlay>}
    {selectedDeletion && <AdminOverlay className="modal-backdrop" onMouseDown={() => setSelectedDeletion(null)}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="deletion-review-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="بستن" onClick={() => setSelectedDeletion(null)}>×</button><span className="admin-kicker">درخواست حذف حساب</span><h2 id="deletion-review-title">{selectedDeletion.customer_name}</h2><p>{selectedDeletion.reason || "دلیلی ثبت نشده است."}</p><label>یادداشت پردازش<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="دلیل تصمیم یا شرح ناشناس‌سازی" /></label><div className="drawer-actions">{selectedDeletion.status === "pending" && <><button className="admin-success" onClick={() => decide("approve")}>تأیید اولیه</button><button className="admin-danger" disabled={!notes.trim()} onClick={() => decide("reject")}>رد درخواست</button></>}{selectedDeletion.status === "approved" && <><button className="admin-danger" disabled={!notes.trim()} onClick={() => decide("complete")}>ناشناس‌سازی و تکمیل</button><button className="admin-secondary" disabled={!notes.trim()} onClick={() => decide("reject")}>بازگرداندن / رد</button></>}</div></section></AdminOverlay>}
  </div>;
}
function AdminRouter() {
  return (
    <Routes>
      <Route index element={<DashboardHome />} />
      <Route path="appointments" element={<Appointments />} />
      <Route path="off-days" element={<SalonClosures />} />
      <Route path="leave-requests" element={<TimeOffManagement />} />
      <Route path="employees" element={<EmployeeManagement />} />
      <Route
        path="services"
        element={<ServiceManagement />}
      />
      <Route path="customers" element={<CustomerManagement />} />
      <Route path="telegram" element={<AdminTelegram />} />
      <Route path="finance" element={<Finance />} />
      <Route path="content" element={<Content />} />
      <Route path="blog" element={<BlogManagement />} />
      <Route path="blog/:id/edit" element={<BlogEditor />} />
      <Route path="blog/:id/preview" element={<BlogPreview />} />
      <Route path="preferences" element={<Preferences />} />
      <Route path="account" element={<AdminAccount />} />
      <Route path="*" element={<DashboardHome />} />
    </Routes>
  );
}
export default AdminRouter;
