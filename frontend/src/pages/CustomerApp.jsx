import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../shared/api";
import { siteConfig } from "../shared/siteConfig";
import PasswordInput from "../components/PasswordInput";

const statusLabels = { pending: "در انتظار تأیید", confirmed: "تأیید شده", completed: "انجام شده", cancelled: "لغو شده" };
const priceLabels = { final: "قیمت نهایی", unresolved: "قیمت پس از مشاوره مشخص می‌شود", estimated: "قیمت تقریبی" };
const formatDate = (value) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeZone: "Asia/Tehran" }).format(new Date(`${value}T12:00:00`)) : "تاریخ مشخص نشده";
const formatMoney = (value) => value == null ? "" : `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;

function useRequest(url, initial = null) {
  const [state, setState] = useState({ data: initial, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; api.get(url).then(({ data }) => active && setState({ data, loading: false, error: "" })).catch(() => active && setState({ data: initial, loading: false, error: "خطا در دریافت اطلاعات. دوباره تلاش کنید." })); return () => { active = false; }; }, [url, initial, revision]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
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
    <div className="customer-actions"><Link className="secondary" to={`/account/appointments/${appointment.id}`}>جزئیات نوبت</Link>{appointment.capabilities?.can_cancel && <button disabled={busy} onClick={cancel}>{busy ? "در حال انجام..." : "لغو نوبت"}</button>}{appointment.capabilities?.policy_code === "policy_not_configured" && <a className="secondary" href={`tel:${siteConfig.mobileInternational}`}>تماس با سالن</a>}</div>
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
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  return <><header className="customer-page-head"><div><span className="customer-kicker">حساب مشتری</span><h1>سلام، {request.data.customer.display_name}</h1><p>نوبت‌ها و اطلاعات حساب شما، یک‌جا.</p></div><Link className="customer-primary" to="/book">رزرو نوبت جدید</Link></header><div className="customer-grid">{request.data.next_appointment ? <div className="customer-panel-wide"><h2>نوبت بعدی</h2><AppointmentCard appointment={request.data.next_appointment} onChanged={request.reload} /></div> : <div className="customer-panel customer-panel-wide customer-empty"><h2>هنوز نوبت آینده‌ای ندارید</h2><p>برای انتخاب خدمات و زمان مناسب، یک رزرو جدید بسازید.</p><Link className="customer-primary" to="/book">شروع رزرو</Link></div>}<div className="customer-panel"><h2>اعلان‌های خوانده‌نشده</h2><strong>{new Intl.NumberFormat("fa-IR").format(request.data.unread_notification_count)}</strong><div className="customer-actions"><Link className="secondary" to="/account/notifications">مشاهده اعلان‌ها</Link></div></div><div className="customer-panel"><h2>سوابق نوبت</h2><strong>{new Intl.NumberFormat("fa-IR").format(request.data.recent_history_count)}</strong><div className="customer-actions"><Link className="secondary" to="/account/appointments">مشاهده سوابق</Link></div></div></div></>;
}

function Appointments() {
  const [filter, setFilter] = useState("upcoming");
  const request = useRequest(`customer/appointments/?filter=${filter}`);
  return <><header className="customer-page-head"><div><span className="customer-kicker">نوبت‌های من</span><h1>سوابق و برنامه</h1></div><Link className="customer-primary" to="/book">رزرو جدید</Link></header><div className="customer-tabs">{[["upcoming", "آینده"], ["completed", "انجام‌شده"], ["cancelled", "لغوشده"]].map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>{request.loading ? <Loading /> : request.error ? <ErrorState message={request.error} /> : request.data.results?.length ? <div className="customer-grid">{request.data.results.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onChanged={request.reload} />)}</div> : <div className="customer-panel customer-empty">برای این بخش نوبتی ثبت نشده است.</div>}</>;
}

function AppointmentDetail({ id }) {
  const request = useRequest(`customer/appointments/${id}/`);
  const [bookAgain, setBookAgain] = useState(null);
  const [reschedule, setReschedule] = useState({ date: "", start_time: "" });
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    if (!reschedule.date || !request.data?.services?.length) return;
    const items = request.data.services.map((service) => ({ service: service.id, employee: service.employee_id }));
    api.get(`availability/?date=${reschedule.date}&items=${encodeURIComponent(JSON.stringify(items))}`).then(({ data }) => setSlots(data.slots || [])).catch(() => setSlots([]));
  }, [reschedule.date, request.data]);
  if (request.loading) return <Loading />;
  if (request.error || !request.data) return <ErrorState message={request.error || "نوبت پیدا نشد."} />;
  const appointment = request.data;
  const submitReschedule = async (event) => {
    event.preventDefault(); setMessage("");
    try { await api.post(`customer/appointments/${id}/reschedule/`, { ...reschedule, idempotency_key: crypto.randomUUID() }); setMessage("زمان نوبت تغییر کرد."); request.reload(); }
    catch (error) { setMessage(error.response?.data?.detail || "تغییر زمان انجام نشد."); }
  };
  return <><header className="customer-page-head"><div><Link to="/account/appointments">← بازگشت به نوبت‌ها</Link><h1>جزئیات نوبت</h1></div><button className="customer-primary" onClick={async () => { const data = (await api.get(`customer/appointments/${id}/book-again/`)).data; setBookAgain(data); navigate(`/book?services=${data.services.map((item) => item.id).join(",")}`, { state: { bookAgain: data } }); }}>رزرو دوباره</button></header><AppointmentCard appointment={appointment} onChanged={request.reload} />{appointment.capabilities?.can_reschedule && <form className="customer-panel customer-form" onSubmit={submitReschedule}><h2>تغییر زمان نوبت</h2><p className="customer-readonly">تمام خدمات این نوبت با همان فاصله زمانی جابه‌جا می‌شوند؛ زمان جدید باید برای همه متخصصان آزاد باشد.</p><label>تاریخ جدید<input required type="date" value={reschedule.date} onChange={(event) => { setSlots([]); setReschedule({ date: event.target.value, start_time: "" }); }} /></label>{reschedule.date && <label>ساعت آزاد<select required value={reschedule.start_time} onChange={(event) => setReschedule({ ...reschedule, start_time: event.target.value })}><option value="">انتخاب ساعت</option>{slots.map((slot) => <option value={slot} key={slot}>{slot}</option>)}</select></label>}{reschedule.date && !slots.length && <p className="customer-readonly">در این تاریخ زمان آزادی پیدا نشد.</p>}{message && <p role="status">{message}</p>}<button className="customer-primary" disabled={!reschedule.start_time}>ثبت زمان جدید</button></form>}{bookAgain && <div className="customer-panel"><h2>خدمات آماده رزرو</h2><p>{bookAgain.services.map((item) => item.name).join("، ")}</p><Link className="customer-primary" to={`/book?services=${bookAgain.services.map((item) => item.id).join(",")}`}>انتخاب تاریخ و زمان</Link></div>}<div className="customer-panel"><h2>رسید نوبت</h2><p>کد پیگیری: {appointment.confirmation_code}</p><button className="customer-primary" onClick={() => window.print()}>چاپ رسید</button></div>{appointment.payments?.length > 0 && <section className="customer-panel"><h2>پرداخت‌ها و بازپرداخت‌ها</h2>{appointment.payments.map((payment) => <div className="customer-service" key={payment.id}><span>{payment.payment_method} · {payment.status}</span><span>{formatMoney(payment.amount)}{payment.refunded_total ? ` · بازپرداخت ${formatMoney(payment.refunded_total)}` : ""}</span></div>)}</section>}</>;
}

function Profile() {
  const request = useRequest("customer/profile/");
  const [message, setMessage] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionMessage, setDeletionMessage] = useState("");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", new_password_confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  const save = async (event) => { event.preventDefault(); setMessage(""); try { await api.patch("customer/profile/", Object.fromEntries(new FormData(event.currentTarget))); setMessage("اطلاعات ذخیره شد."); } catch { setMessage("ذخیره اطلاعات انجام نشد."); } };
  const requestDeletion = async () => { if (!window.confirm("درخواست حذف حساب ثبت شود؟ سوابق مالی و نوبت‌ها طبق قانون نگهداری می‌شوند.")) return; try { const { data } = await api.post("customer/account/deletion-request/", { confirm: true, password: deletionPassword }); setDeletionMessage(data.status === "pending" ? "درخواست حذف حساب شما برای بررسی ثبت شد." : "درخواست حذف حساب قبلی شما موجود است."); } catch (error) { setDeletionMessage(error.response?.data?.detail || "ثبت درخواست حذف انجام نشد."); } };
  const changePassword = async (event) => { event.preventDefault(); setPasswordMessage(""); try { const { data } = await api.post("customer/password/", passwords); setPasswordMessage(data.detail); setPasswords({ current_password: "", new_password: "", new_password_confirm: "" }); } catch (error) { const detail = error.response?.data; setPasswordMessage(detail?.detail || Object.values(detail || {})?.flat?.()[0] || "تغییر رمز انجام نشد."); } };
  return <><header className="customer-page-head"><div><span className="customer-kicker">پروفایل</span><h1>اطلاعات من</h1></div></header><form className="customer-panel customer-form" onSubmit={save}><label>نام<input name="first_name" defaultValue={request.data.first_name || ""} /></label><label>نام خانوادگی<input name="last_name" defaultValue={request.data.last_name || ""} /></label><label>تاریخ تولد<input name="birthday" type="date" defaultValue={request.data.birthday || ""} /></label><label>محله<input name="neighborhood" defaultValue={request.data.neighborhood || ""} /></label><label>ترجیحات خدمات<textarea name="service_preferences" defaultValue={request.data.service_preferences} maxLength="2000" /></label><label>شماره تماس<input value={request.data.phone || "ثبت نشده"} disabled readOnly /></label><label>ایمیل بازیابی<input value={request.data.email || "ثبت نشده"} disabled readOnly /></label><p className="customer-readonly">برای تغییر شماره تماس یا ایمیل بازیابی، با سالن هماهنگ کنید؛ تغییر بدون تأیید واقعی انجام نمی‌شود.</p>{message && <p role="status">{message}</p>}<button className="customer-primary">ذخیره تغییرات</button></form><form className="customer-panel customer-form" onSubmit={changePassword}><h2>تغییر رمز عبور</h2><label>رمز فعلی<PasswordInput required visibilityLabel="رمز فعلی" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></label><label>رمز جدید<PasswordInput required visibilityLabel="رمز جدید" autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} /></label><label>تکرار رمز جدید<PasswordInput required visibilityLabel="تکرار رمز جدید" autoComplete="new-password" value={passwords.new_password_confirm} onChange={(event) => setPasswords({ ...passwords, new_password_confirm: event.target.value })} /></label>{passwordMessage && <p role="status">{passwordMessage}</p>}<button className="customer-primary">تغییر رمز عبور</button></form><section className="customer-panel"><h2>درخواست حذف حساب</h2><p className="customer-readonly">نوبت‌ها، پرداخت‌ها و سوابق مالی ممکن است برای الزامات قانونی نگهداری شوند. حذف حساب پس از بررسی سالن انجام می‌شود.</p><label className="customer-form">رمز عبور فعلی<PasswordInput visibilityLabel="رمز عبور فعلی" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} autoComplete="current-password" /></label>{deletionMessage && <p role="status">{deletionMessage}</p>}<div className="customer-actions"><button className="secondary" onClick={requestDeletion}>ثبت درخواست حذف</button></div></section></>;
}

function Preferences() {
  const request = useRequest("customer/preferences/");
  const [message, setMessage] = useState("");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  const save = async (event) => { event.preventDefault(); const form = event.currentTarget; setMessage(""); try { await api.patch("customer/preferences/", { operational_reminders: form.operational_reminders.checked, promotional_messages: form.promotional_messages.checked }); setMessage("ترجیحات ذخیره شد."); } catch { setMessage("ذخیره ترجیحات انجام نشد."); } };
  return <><header className="customer-page-head"><div><span className="customer-kicker">ترجیحات ارتباطی</span><h1>چطور با شما در ارتباط باشیم؟</h1></div></header><form className="customer-panel customer-form" onSubmit={save}><label className="customer-checkbox"><input type="checkbox" name="operational_reminders" defaultChecked={request.data.operational_reminders} /> یادآوری‌های مربوط به نوبت</label><label className="customer-checkbox"><input type="checkbox" name="promotional_messages" defaultChecked={request.data.promotional_messages} /> پیام‌های تبلیغاتی</label><p className="customer-readonly">کانال‌های فعال: {Object.entries(request.data.available_channels || {}).filter(([, enabled]) => enabled).map(([name]) => name).join("، ") || "فعلاً کانال ارسال فعالی پیکربندی نشده است."}</p>{message && <p role="status">{message}</p>}<button className="customer-primary">ذخیره ترجیحات</button></form></>;
}

function Notifications() {
  const request = useRequest("customer/notifications/");
  if (request.loading) return <Loading />;
  if (request.error) return <ErrorState message={request.error} />;
  return <><header className="customer-page-head"><div><span className="customer-kicker">اعلان‌ها</span><h1>پیام‌های حساب</h1></div><button className="customer-primary" onClick={async () => { await api.post("customer/notifications/read-all/"); request.reload(); }}>خواندن همه</button></header>{request.data.results?.length ? <div className="customer-grid">{request.data.results.map((item) => <article className={`customer-panel ${item.is_read ? "" : "customer-appointment"}`} key={item.id}><h2>{item.title}</h2><p>{item.message}</p><small>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small>{!item.is_read && <div className="customer-actions"><button onClick={async () => { await api.post(`customer/notifications/${item.id}/read/`); request.reload(); }}>خواندم</button></div>}</article>)}</div> : <div className="customer-panel customer-empty">اعلانی برای نمایش وجود ندارد.</div>}</>;
}

function Loading() { return <div className="customer-panel customer-empty" role="status">در حال دریافت اطلاعات...</div>; }
function ErrorState({ message }) { return <div className="customer-panel customer-error" role="alert">{message}</div>; }
