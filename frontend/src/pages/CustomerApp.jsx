import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../shared/api";

const statusLabels = { pending: "در انتظار تأیید", confirmed: "تأیید شده", completed: "انجام شده", cancelled: "لغو شده" };
const priceLabels = { final: "قیمت نهایی", unresolved: "قیمت پس از مشاوره مشخص می‌شود", estimated: "قیمت تقریبی" };
const formatDate = (value) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeZone: "Asia/Tehran" }).format(new Date(`${value}T12:00:00`)) : "تاریخ مشخص نشده";
const formatMoney = (value) => value == null ? "" : `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;

function useRequest(url, initial = null) {
  const [state, setState] = useState({ data: initial, loading: true, error: "" });
  useEffect(() => { let active = true; setState({ data: initial, loading: true, error: "" }); api.get(url).then(({ data }) => active && setState({ data, loading: false, error: "" })).catch(() => active && setState({ data: initial, loading: false, error: "خطا در دریافت اطلاعات. دوباره تلاش کنید." })); return () => { active = false; }; }, [url, initial]);
  return state;
}

function AppointmentCard({ appointment, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cancel = async () => {
    if (!window.confirm("لغو این نوبت را تأیید می‌کنید؟")) return;
    setBusy(true); setMessage("");
    try { await api.post(`customer/appointments/${appointment.id}/cancel/`, { reason: "لغو توسط مشتری", idempotency_key: crypto.randomUUID() }); setMessage("نوبت با موفقیت لغو شد."); onChanged?.(); } catch (error) { setMessage(error.response?.data?.detail || "لغو نوبت انجام نشد."); } finally { setBusy(false); }
  };
  return <article className="customer-panel customer-appointment">
    <div className="customer-meta"><strong>{statusLabels[appointment.status] || appointment.status}</strong><span>{formatDate(appointment.date)}، ساعت {appointment.start_time || "-"}</span></div>
    <div className="customer-services">{appointment.services?.map((service, index) => <div className="customer-service" key={`${service.name}-${index}`}><span>{service.name}<small> · {service.specialist}</small></span><span className={service.price == null ? "customer-price-unresolved" : "customer-price"}>{service.price == null ? priceLabels[service.price_status] : formatMoney(service.price)}</span></div>)}</div>
    <div className="customer-meta"><span>وضعیت پرداخت: {appointment.payment_status === "paid" ? "پرداخت کامل" : appointment.payment_status === "refunded" ? "بازپرداخت شده" : "در انتظار پرداخت"}</span><span>کد پیگیری: {appointment.confirmation_code}</span></div>
    {message && <p className="customer-error" role="status">{message}</p>}
    <div className="customer-actions"><Link className="secondary" to={`/account/appointments/${appointment.id}`}>جزئیات نوبت</Link>{appointment.capabilities?.can_cancel && <button disabled={busy} onClick={cancel}>{busy ? "در حال انجام..." : "لغو نوبت"}</button>}</div>
  </article>;
}

export default function CustomerApp() {
  const location = useLocation();
  const path = location.pathname;
  if (path === "/account" || path === "/account/") return <Dashboard />;
  if (path === "/account/appointments" || path === "/account/appointments/") return <Appointments />;
  if (path === "/account/notifications" || path === "/account/notifications/") return <Notifications />;
  if (path === "/account/profile" || path === "/account/profile/") return <Profile />;
  if (path === "/account/preferences" || path === "/account/preferences/") return <Preferences />;
  const match = path.match(/^\/account\/appointments\/(\d+)\/?$/);
  return match ? <AppointmentDetail id={match[1]} /> : <Dashboard />;
}

function Dashboard() {
  const request = useRequest("customer/dashboard/");
  const navigate = useNavigate();
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  return <><header className="customer-page-head"><div><span className="customer-kicker">حساب مشتری</span><h1>سلام، {request.data.customer.display_name}</h1><p>نوبت‌ها و اطلاعات حساب شما، یک‌جا.</p></div><Link className="customer-primary" to="/book">رزرو نوبت جدید</Link></header><div className="customer-grid">{request.data.next_appointment ? <div className="customer-panel-wide"><h2>نوبت بعدی</h2><AppointmentCard appointment={request.data.next_appointment} onChanged={() => navigate("/account")} /></div> : <div className="customer-panel customer-panel-wide customer-empty"><h2>هنوز نوبت آینده‌ای ندارید</h2><p>برای انتخاب خدمات و زمان مناسب، یک رزرو جدید بسازید.</p><Link className="customer-primary" to="/book">شروع رزرو</Link></div>}<div className="customer-panel"><h2>اعلان‌های خوانده‌نشده</h2><strong>{new Intl.NumberFormat("fa-IR").format(request.data.unread_notification_count)}</strong><div className="customer-actions"><Link className="secondary" to="/account/notifications">مشاهده اعلان‌ها</Link></div></div><div className="customer-panel"><h2>سوابق نوبت</h2><strong>{new Intl.NumberFormat("fa-IR").format(request.data.recent_history_count)}</strong><div className="customer-actions"><Link className="secondary" to="/account/appointments">مشاهده سوابق</Link></div></div></div></>;
}

function Appointments() {
  const [filter, setFilter] = useState("upcoming");
  const request = useRequest(`customer/appointments/?filter=${filter}`);
  return <><header className="customer-page-head"><div><span className="customer-kicker">نوبت‌های من</span><h1>سوابق و برنامه</h1></div><Link className="customer-primary" to="/book">رزرو جدید</Link></header><div className="customer-tabs">{[["upcoming", "آینده"], ["completed", "انجام‌شده"], ["cancelled", "لغوشده"]].map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>{request.loading ? <Loading /> : request.error ? <ErrorState message={request.error} /> : request.data.results?.length ? <div className="customer-grid">{request.data.results.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}</div> : <div className="customer-panel customer-empty">برای این بخش نوبتی ثبت نشده است.</div>}</>;
}

function AppointmentDetail({ id }) {
  const request = useRequest(`customer/appointments/${id}/`);
  const [bookAgain, setBookAgain] = useState(null);
  const navigate = useNavigate();
  if (request.loading) return <Loading />;
  if (request.error || !request.data) return <ErrorState message={request.error || "نوبت پیدا نشد."} />;
  const appointment = request.data;
  return <><header className="customer-page-head"><div><Link to="/account/appointments">← بازگشت به نوبت‌ها</Link><h1>جزئیات نوبت</h1></div><button className="customer-primary" onClick={async () => { const data = (await api.get(`customer/appointments/${id}/book-again/`)).data; setBookAgain(data); navigate(`/book?services=${data.services.map((item) => item.id).join(",")}`, { state: { bookAgain: data } }); }}>رزرو دوباره</button></header><AppointmentCard appointment={appointment} />{bookAgain && <div className="customer-panel"><h2>خدمات آماده رزرو</h2><p>{bookAgain.services.map((item) => item.name).join("، ")}</p><Link className="customer-primary" to={`/book?services=${bookAgain.services.map((item) => item.id).join(",")}`}>انتخاب تاریخ و زمان</Link></div>}<div className="customer-panel"><h2>رسید نوبت</h2><p>کد پیگیری: {appointment.confirmation_code}</p><button className="customer-primary" onClick={() => window.print()}>چاپ رسید</button></div></>;
}

function Profile() {
  const request = useRequest("customer/profile/");
  const [message, setMessage] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionMessage, setDeletionMessage] = useState("");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  const save = async (event) => { event.preventDefault(); setMessage(""); try { await api.patch("customer/profile/", Object.fromEntries(new FormData(event.currentTarget))); setMessage("اطلاعات ذخیره شد."); } catch { setMessage("ذخیره اطلاعات انجام نشد."); } };
  const requestDeletion = async () => { if (!window.confirm("درخواست حذف حساب ثبت شود؟ سوابق مالی و نوبت‌ها طبق قانون نگهداری می‌شوند.")) return; try { const { data } = await api.post("customer/account/deletion-request/", { confirm: true, password: deletionPassword }); setDeletionMessage(data.status === "pending" ? "درخواست حذف حساب شما برای بررسی ثبت شد." : "درخواست حذف حساب قبلی شما موجود است."); } catch (error) { setDeletionMessage(error.response?.data?.detail || "ثبت درخواست حذف انجام نشد."); } };
  return <><header className="customer-page-head"><div><span className="customer-kicker">پروفایل</span><h1>اطلاعات من</h1></div></header><form className="customer-panel customer-form" onSubmit={save}><label>نام<input name="first_name" defaultValue={request.data.first_name || ""} /></label><label>نام خانوادگی<input name="last_name" defaultValue={request.data.last_name || ""} /></label><label>تاریخ تولد<input name="birthday" type="date" defaultValue={request.data.birthday || ""} /></label><label>ترجیحات خدمات<textarea name="service_preferences" defaultValue={request.data.service_preferences} maxLength="2000" /></label><label>شماره تماس<input value={request.data.phone || "ثبت نشده"} disabled readOnly /></label><p className="customer-readonly">برای تغییر شماره تماس، با سالن هماهنگ کنید؛ تغییر بدون تأیید واقعی انجام نمی‌شود.</p>{message && <p role="status">{message}</p>}<button className="customer-primary">ذخیره تغییرات</button></form><section className="customer-panel"><h2>درخواست حذف حساب</h2><p className="customer-readonly">نوبت‌ها، پرداخت‌ها و سوابق مالی ممکن است برای الزامات قانونی نگهداری شوند. حذف حساب پس از بررسی سالن انجام می‌شود.</p><label className="customer-form">رمز عبور فعلی<input type="password" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} autoComplete="current-password" /></label>{deletionMessage && <p role="status">{deletionMessage}</p>}<div className="customer-actions"><button className="secondary" onClick={requestDeletion}>ثبت درخواست حذف</button></div></section></>;
}

function Preferences() {
  const request = useRequest("customer/preferences/");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  const save = async (event) => { event.preventDefault(); const form = event.currentTarget; await api.patch("customer/preferences/", { operational_reminders: form.operational_reminders.checked, promotional_messages: form.promotional_messages.checked }); };
  return <><header className="customer-page-head"><div><span className="customer-kicker">ترجیحات ارتباطی</span><h1>چطور با شما در ارتباط باشیم؟</h1></div></header><form className="customer-panel customer-form" onSubmit={save}><label className="customer-checkbox"><input type="checkbox" name="operational_reminders" defaultChecked={request.data.operational_reminders} /> یادآوری‌های مربوط به نوبت</label><label className="customer-checkbox"><input type="checkbox" name="promotional_messages" defaultChecked={request.data.promotional_messages} /> پیام‌های تبلیغاتی</label><p className="customer-readonly">کانال‌هایی که هنوز ارائه‌دهنده فعال ندارند، در دسترس نمایش داده نمی‌شوند.</p><button className="customer-primary">ذخیره ترجیحات</button></form></>;
}

function Notifications() {
  const request = useRequest("customer/notifications/");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  return <><header className="customer-page-head"><div><span className="customer-kicker">اعلان‌ها</span><h1>پیام‌های حساب</h1></div><button className="customer-primary" onClick={() => api.post("customer/notifications/read-all/")}>خواندن همه</button></header>{request.data.results?.length ? <div className="customer-grid">{request.data.results.map((item) => <article className={`customer-panel ${item.is_read ? "" : "customer-appointment"}`} key={item.id}><h2>{item.title}</h2><p>{item.message}</p><small>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small>{!item.is_read && <div className="customer-actions"><button onClick={() => api.post(`customer/notifications/${item.id}/read/`)}>خواندم</button></div>}</article>)}</div> : <div className="customer-panel customer-empty">اعلانی برای نمایش وجود ندارد.</div>}</>;
}

function Loading() { return <div className="customer-panel customer-empty" role="status">در حال دریافت اطلاعات...</div>; }
function ErrorState({ message }) { return <div className="customer-panel customer-error" role="alert">{message}</div>; }
