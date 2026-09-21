import { PanelDisclosure } from "../components/PanelGuide";
import { formatServicePrice } from "../shared/pricing";
import ItemPricing from "../components/ItemPricing";
import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { api, logoutSession, toman } from "../shared/api";
import { JalaliDatePicker } from "../components/DatePicker";
import { disableCurrentFirebaseDevice } from "../shared/firebasePush";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PasswordInput from "../components/PasswordInput";
import { formatJalaliDate } from "../shared/date";
import { toGregorian, toJalaali } from "jalaali-js";

const unwrap = (data) => data?.results || data || [];
const statusNames = {
  pending: "در انتظار",
  confirmed: "تأیید شده",
  in_progress: "در حال انجام",
  completed: "انجام شده",
  cancelled: "لغو شده",
};
const errorText = (error, fallback) => {
  const data = error.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  const value = Object.values(data)[0];
  return Array.isArray(value) ? value.join(" ") : String(value);
};
function Skeleton() {
  return (
    <div className="employee-skeleton">
      <span />
      <span />
      <span />
    </div>
  );
}
function Empty({
  title = "چیزی برای نمایش نیست",
  text = "اطلاعات جدید پس از ثبت در اینجا دیده می‌شود.",
}) {
  return (
    <div className="employee-empty">
      <strong>{title}</strong>
      {text}
    </div>
  );
}
function useData(endpoint) {
  const [state, setState] = useState({ data: [], error: "", loading: true });
  const reload = () => {
    setState({ data: [], error: "", loading: true });
    api
      .get(endpoint)
      .then(({ data }) =>
        setState({ data: unwrap(data), error: "", loading: false }),
      )
      .catch((error) =>
        setState({
          data: [],
          error: errorText(error, "دریافت اطلاعات انجام نشد"),
          loading: false,
        }),
      );
  };
  useEffect(reload, [endpoint]);
  return { ...state, reload };
}
function Heading({ kicker, title }) {
  return (
    <>
      <span className="employee-kicker">{kicker}</span>
      <h1 className="employee-page-title">{title}</h1>
    </>
  );
}
function AppointmentCard({ item, onClick }) {
  const line = item.items?.[0] || item;
  const name = item.customer_name || item.customer?.name || "مشتری";
  return (
    <button
      className={`employee-appointment ${item.status || line.completion_status || "pending"}`}
      onClick={onClick}
    >
      <time>{line.start_time || "--:--"}</time>
      <i className="appt-bar" />
      <span>
        <b>{name}</b>
        <small>
          {line.service_name || "سرویس رزرو شده"} · {line.end_time || ""}
        </small>
      </span>
      <em className={`employee-status ${item.status}`}>
        {statusNames[item.status] || item.status || "در انتظار"}
      </em>
    </button>
  );
}
function DailyWorkspace() {
  const today = isoDate(new Date());
  const appointments = useData(`employee/appointments/?date=${today}`);
  const summary = useData("employee/statistics/");
  const [selected, setSelected] = useState(null);
  const next = summary.data.next_appointment;
  const nextItem = summary.data.next_appointment_item;
  return (
    <div className="employee-page">
      <Heading kicker="روز کاری من" title="امروز" />
      <Link className="employee-action" to="/employee/appointments/new">
        + نوبت جدید
      </Link>
      {summary.error || appointments.error ? (
        <div className="schedule-message">
          {summary.error || appointments.error}
        </div>
      ) : null}
      {next ? (
        <section className="employee-card next-card">
          <span className="employee-kicker">نوبت بعدی</span>
          <h2>{next.customer_name || "مشتری"}</h2>
          <p>
            {nextItem?.service_name || "سرویس رزرو شده"} ·{" "}
            {nextItem?.duration_snapshot || "--"} دقیقه
          </p>
          <strong className="next-time">
            {nextItem?.start_time || "--:--"}
          </strong>
          <div className="next-actions">
            <button onClick={() => setSelected(next)}>مشاهده جزئیات</button>
          </div>
        </section>
      ) : (
        <section className="employee-card">
          <Empty title="نوبت بعدی ندارید" text="برنامه امروز شما خالی است." />
        </section>
      )}
      <div className="employee-stat-grid">
        <div className="employee-stat">
          <span>نوبت‌های امروز</span>
          <strong>{summary.data.today_total || 0}</strong>
        </div>
        <div className="employee-stat">
          <span>تکمیل‌شده</span>
          <strong>{summary.data.completed_services || 0}</strong>
          <small>{summary.data.remaining_services || 0} سرویس باقی‌مانده</small>
        </div>
        <div className="employee-stat">
          <span>کمیسیون امروز</span>
          <strong>{toman(summary.data.employee_commission || 0)}</strong>
        </div>
      </div>
      <div className="day-label">
        <h2>برنامه امروز</h2>
        <span>{summary.data.today_total || 0} نوبت</span>
      </div>
      {appointments.loading ? (
        <Skeleton />
      ) : appointments.error ? null : appointments.data.length ? (
        appointments.data.map((item) => (
          <AppointmentCard
            key={item.id}
            item={item}
            onClick={() => setSelected(item)}
          />
        ))
      ) : (
        <Empty title="امروز نوبتی برای شما ثبت نشده است." />
      )}
      {selected && (
        <AppointmentDetail
          item={selected}
          close={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            appointments.reload();
            summary.reload();
          }}
        />
      )}
    </div>
  );
}

function NewAppointment() {
  const navigate = useNavigate();
  const services = useData("employee/services/");
  const profile = useData("employee/profile/");
  const [selectedServices, setSelectedServices] = useState([]);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!query.trim()) return setCustomers([]);
    api
      .get(`employee/customers/?q=${encodeURIComponent(query)}`)
      .then(({ data }) => setCustomers(unwrap(data)))
      .catch(() => setCustomers([]));
  }, [query]);
  useEffect(() => {
    if (!date || !selectedServices.length || !profile.data.id)
      return setSlots([]);
    const items = selectedServices.map((service) => ({
      service,
      employee: profile.data.id,
    }));
    api
      .get(
        `availability/?date=${date}&items=${encodeURIComponent(JSON.stringify(items))}`,
      )
      .then(({ data }) => setSlots(data.slots || []))
      .catch(() => setSlots([]));
  }, [date, selectedServices, profile.data.id]);
  const toggleService = (serviceId) => {
    setTime("");
    setSelectedServices((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.post("employee/appointments/create/", {
        customer: customer?.id,
        customer_name: customer ? undefined : newCustomer.name,
        customer_phone: customer ? undefined : newCustomer.phone,
        services: selectedServices,
        date,
        start_time: time,
        notes,
      });
      navigate("/employee/calendar");
    } catch (error) {
      setMessage(errorText(error, "در ثبت نوبت خطایی رخ داد."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="employee-page">
      <Heading kicker="ثبت سریع" title="نوبت جدید" />
      <p className="new-appointment-lead">مشتری، سرویس و زمان مناسب را انتخاب کنید تا نوبت در برنامه شما ثبت شود.</p>
      <form className="employee-form new-appointment-form" onSubmit={submit}>
        <section className="employee-card appointment-step customer-step">
          <div className="appointment-step-title"><span>۱</span><div><h2>مشتری</h2><p>مشتری قبلی را پیدا کنید یا اطلاعات مشتری جدید را وارد کنید.</p></div></div>
          <label>
            جستجوی مشتری
            <input value={query} onChange={(event) => { setQuery(event.target.value); setCustomer(null); }} placeholder="نام یا شماره تماس" />
          </label>
          {customers.length > 0 && <div className="customer-search-results">{customers.map((entry) => (
            <button className="customer-search-result" type="button" key={entry.id} onClick={() => { setCustomer(entry); setQuery(entry.name); }}>
              <i aria-hidden="true">{entry.name?.[0] || "م"}</i><span><b>{entry.name}</b><small>{entry.phone}</small></span><em>انتخاب</em>
            </button>
          ))}</div>}
          {customer ? (
            <div className="selected-customer"><span><b>{customer.name}</b><small>{customer.phone}</small></span><button type="button" onClick={() => { setCustomer(null); setQuery(""); }}>تغییر مشتری</button></div>
          ) : (
            <div className="new-customer-fields"><label>نام مشتری جدید<input value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} required /></label><label>شماره تماس<input type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} required /></label></div>
          )}
        </section>
        <section className="employee-card appointment-step">
          <div className="appointment-step-title"><span>۲</span><div><h2>سرویس‌ها</h2><p>یک یا چند سرویس را برای این نوبت انتخاب کنید.</p></div></div>
          <fieldset className="employee-service-list">
            <legend>سرویس‌های من</legend>
          {services.loading ? (
            <Skeleton />
          ) : (
            services.data.map((service) => (
              <label className={selectedServices.includes(service.id) ? "selected" : ""} key={service.id}>
                <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} />
                <span><b>{service.persian_name}</b><small>{formatServicePrice(service)}</small>{service.duration && <small>{service.duration} دقیقه</small>}</span>
              </label>
            ))
          )}
          </fieldset>
        </section>
        <section className="employee-card appointment-step">
          <div className="appointment-step-title"><span>۳</span><div><h2>زمان نوبت</h2><p>تاریخ و یکی از زمان‌های آزاد را انتخاب کنید.</p></div></div>
          <label>تاریخ<JalaliDatePicker value={date} onChange={(value) => { setDate(value); setTime(""); }} /></label>
          {date && selectedServices.length ? <><span className="available-slots-title">زمان‌های آزاد</span><div className="slot-grid">{slots.map((slot) => <button className={time === slot ? "selected" : ""} type="button" onClick={() => setTime(slot)} key={slot}>{slot}</button>)}</div>{!slots.length && <small className="slot-empty">زمان آزادی برای این ترکیب سرویس‌ها وجود ندارد.</small>}</> : <p className="appointment-hint">ابتدا حداقل یک سرویس را انتخاب کنید تا زمان‌های آزاد نمایش داده شوند.</p>}
        </section>
        <section className="employee-card appointment-step appointment-notes"><label>توضیحات برای پذیرش (اختیاری)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="نکته یا درخواست مشتری را اینجا بنویسید" /></label></section>
        <button className="employee-action appointment-submit" disabled={saving || !selectedServices.length || !time}>{saving ? "در حال ثبت..." : "ثبت نوبت"}</button>
        {message && <small className="schedule-message">{message}</small>}
      </form>
    </div>
  );
}
const isoDate = (value) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(value);
const jalaliDateLabel = (value) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tehran",
  }).format(new Date(`${value}T12:00:00`));
const addDays = (value, amount) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return isoDate(next);
};
function CalendarWorkspace() {
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => `${isoDate(new Date()).slice(0, 7)}-01`);
  const [selected, setSelected] = useState(null);
  const monthValue = new Date(`${visibleMonth}T12:00:00`);
  const monthJalali = toJalaali(monthValue.getFullYear(), monthValue.getMonth() + 1, monthValue.getDate());
  const firstGregorian = toGregorian(monthJalali.jy, monthJalali.jm, 1);
  const calendarStart = new Date(firstGregorian.gy, firstGregorian.gm - 1, firstGregorian.gd, 12);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(isoDate(calendarStart), index));
  const endpoint = `employee/appointments/?start=${calendarDays[0]}&end=${calendarDays[41]}`;
  const appointments = useData(endpoint);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("appointment");
    if (!/^\d+$/.test(id || "")) return;
    let active = true;
    api.get(`employee/appointments/?appointment=${id}`).then(({ data }) => {
      const appointment = (data.results || data)[0];
      if (!active || !appointment) return;
      setSelected(appointment);
      const date = appointment.items?.[0]?.date;
      if (date) {
        setSelectedDate(date);
        setVisibleMonth(`${date.slice(0, 7)}-01`);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [location.search]);
  const moveMonth = (direction) => {
    const index = monthJalali.jm - 1 + direction;
    const jy = monthJalali.jy + Math.floor(index / 12);
    const jm = (((index % 12) + 12) % 12) + 1;
    const next = toGregorian(jy, jm, 1);
    const value = `${next.gy}-${String(next.gm).padStart(2, "0")}-${String(next.gd).padStart(2, "0")}`;
    setVisibleMonth(value);
    setSelectedDate(value);
  };
  const moveWeek = (direction) => {
    const value = addDays(selectedDate, direction * 7);
    setSelectedDate(value);
    setVisibleMonth(`${value.slice(0, 7)}-01`);
  };
  const selectToday = () => {
    const value = isoDate(new Date());
    setSelectedDate(value);
    setVisibleMonth(`${value.slice(0, 7)}-01`);
  };
  const selectedAppointments = appointments.data.filter((appointment) =>
    appointment.items?.some((item) => item.date === selectedDate),
  );
  const selectedWeekStart = new Date(`${selectedDate}T12:00:00`);
  selectedWeekStart.setDate(selectedWeekStart.getDate() - selectedWeekStart.getDay());
  const selectedWeekEnd = new Date(selectedWeekStart);
  selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6);

  return (
    <div className="employee-page">
      <Heading kicker="برنامه‌ریزی" title="تقویم" />
      <section className="employee-card employee-month-calendar">
        <div className="employee-calendar-head">
          <div><small>تقویم شمسی</small><h2>{new Intl.NumberFormat("fa-IR").format(monthJalali.jy)} / {new Intl.NumberFormat("fa-IR").format(monthJalali.jm)}</h2></div>
          <div className="employee-calendar-month-actions"><button type="button" aria-label="ماه قبل" onClick={() => moveMonth(-1)}>‹</button><button type="button" onClick={selectToday}>امروز</button><button type="button" aria-label="ماه بعد" onClick={() => moveMonth(1)}>›</button></div>
          <div className="employee-calendar-week-actions"><button type="button" aria-label="هفته قبل" onClick={() => moveWeek(-1)}>‹</button><button type="button" onClick={selectToday}>این هفته</button><button type="button" aria-label="هفته بعد" onClick={() => moveWeek(1)}>›</button></div>
        </div>
        <div className="employee-calendar-weekdays">{["ی", "د", "س", "چ", "پ", "ج", "ش"].map((day) => <b key={day}>{day}</b>)}</div>
        {appointments.loading ? <Skeleton /> : appointments.error ? <div className="schedule-message">{appointments.error}</div> : <div className="employee-calendar-days">
          {calendarDays.map((day) => {
            const date = new Date(`${day}T12:00:00`);
            const local = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
            const count = appointments.data.filter((appointment) => appointment.items?.some((item) => item.date === day)).length;
            return <button type="button" aria-label={day} key={day} className={[day === selectedDate && "selected", day === isoDate(new Date()) && "today", date >= selectedWeekStart && date <= selectedWeekEnd && "current-week", (local.jy !== monthJalali.jy || local.jm !== monthJalali.jm) && "muted"].filter(Boolean).join(" ")} onClick={() => setSelectedDate(day)}><span className="employee-calendar-number">{new Intl.NumberFormat("fa-IR").format(local.jd)}</span><small>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", timeZone: "Asia/Tehran" }).format(date)}</small>{count > 0 && <b>{new Intl.NumberFormat("fa-IR").format(count)} نوبت</b>}</button>;
          })}
        </div>}
      </section>
      <section className="calendar-day employee-selected-day">
        <div className="day-label"><h2>{jalaliDateLabel(selectedDate)}</h2><span>{new Intl.NumberFormat("fa-IR").format(selectedAppointments.length)} نوبت</span></div>
        {!appointments.loading && (selectedAppointments.length ? selectedAppointments.map((appointment) => <AppointmentCard key={appointment.id} item={appointment} onClick={() => setSelected(appointment)} />) : <Empty title="برای این روز نوبتی ندارید" text="روز دیگری را از تقویم انتخاب کنید." />)}
      </section>
      {selected && (
        <AppointmentDetail
          item={selected}
          close={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            appointments.reload();
          }}
        />
      )}
    </div>
  );
}

function Availability() {
  const timeOff = useData("employee/time-off/");
  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.start_date || !form.end_date) {
      setMessage("تاریخ شروع و پایان را انتخاب کنید.");
      return;
    }
    if (form.end_date < form.start_date) {
      setMessage("تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api.post("employee/time-off/", form);
      setForm({ start_date: "", end_date: "", reason: "" });
      setMessage("درخواست مرخصی برای بررسی مدیر ثبت شد.");
      timeOff.reload();
    } catch (error) {
      setMessage(errorText(error, "ثبت مرخصی انجام نشد"));
    } finally {
      setSaving(false);
    }
  };
  const withdraw = async (id) => {
    setWithdrawing(id); setMessage("");
    try {
      await api.delete(`employee/time-off/${id}/`);
      setMessage("درخواست مرخصی پس گرفته شد.");
      timeOff.reload();
    } catch (error) {
      setMessage(errorText(error, "پس‌گرفتن درخواست انجام نشد"));
    } finally { setWithdrawing(null); }
  };

  return (
    <div className="employee-page">
      <Heading kicker="برنامه کاری" title="ساعات کاری و مرخصی" />
      <WeeklyScheduleEditor />
      <section className="employee-card">
        <h2>درخواست مرخصی</h2>
        <p>درخواست پس از تأیید مدیر در تقویم کاری شما اعمال می‌شود.</p>
        <form className="employee-form" onSubmit={submit}>
          <label>
            از
            <JalaliDatePicker
              value={form.start_date}
              onChange={(value) => setForm({ ...form, start_date: value })}
            />
          </label>
          <label>
            تا
            <JalaliDatePicker
              value={form.end_date}
              onChange={(value) => setForm({ ...form, end_date: value })}
            />
          </label>
          <label>
            دلیل
            <textarea
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
            />
          </label>
          <button className="employee-action" disabled={saving}>
            {saving ? "در حال ثبت..." : "ارسال درخواست"}
          </button>
          {message && <small className="schedule-message">{message}</small>}
        </form>
      </section>
      <section className="employee-card">
        <h2>مرخصی‌های ثبت‌شده</h2>
        {timeOff.loading ? (
          <Skeleton />
        ) : timeOff.error ? (
          <small className="schedule-message">{timeOff.error}</small>
        ) : timeOff.data.length ? (
          timeOff.data.map((entry) => (
            <div className="time-off-row" key={entry.id}>
              <b>
                {formatJalaliDate(entry.start_date, "—")} تا {formatJalaliDate(entry.end_date, "—")}
              </b>
              <small>{entry.reason || "بدون توضیح"}</small>
              <span className={`employee-status ${entry.status}`}>{{ pending: "در انتظار بررسی", approved: "تأیید شده", rejected: "رد شده", withdrawn: "پس‌گرفته شده" }[entry.status] || entry.status}</span>
              {entry.review_notes && <small>یادداشت مدیر: {entry.review_notes}</small>}
              {entry.status === "pending" && <button type="button" className="employee-inline-danger" disabled={withdrawing === entry.id} onClick={() => withdraw(entry.id)}>{withdrawing === entry.id ? "در حال انجام..." : "پس‌گرفتن درخواست"}</button>}
            </div>
          ))
        ) : (
          <Empty title="مرخصی ثبت نشده است" text="" />
        )}
      </section>
    </div>
  );
}

const paymentStatusNames = {
  pending: "در انتظار تأیید",
  paid: "تأیید شده",
  failed: "رد شده",
  refunded: "بازپرداخت شده",
  unpaid: "پرداخت‌نشده",
  partially_paid: "پرداخت جزئی",
  partially_refunded: "بازپرداخت جزئی",
};
const paymentMethodNames = {
  cash: "نقدی",
  card: "کارت",
  bank_transfer: "انتقال بانکی",
  online: "آنلاین",
  other: "سایر",
};

function PaymentReport({ appointmentId }) {
  const history = useData(`employee/appointments/${appointmentId}/payments/`);
  const [form, setForm] = useState({
    amount: "",
    payment_method: "cash",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pendingTotal = Number(history.data.pending_total || 0);
  const reportableTotal = history.data.reportable_total == null
    ? Math.max(0, Number(history.data.remaining_total || 0) - pendingTotal)
    : Number(history.data.reportable_total);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.post(`employee/appointments/${appointmentId}/payments/`, {
        ...form,
        amount: Number(form.amount || reportableTotal),
      });
      setForm({ amount: "", payment_method: "cash", notes: "" });
      setMessage("گزارش پرداخت برای تأیید مدیریت ثبت شد.");
      history.reload();
    } catch (error) {
      setMessage(errorText(error, "خطا در ثبت پرداخت"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="employee-card">
      <h2>پرداخت نوبت</h2>
      {history.loading ? (
        <Skeleton />
      ) : history.error ? (
        <small className="schedule-message">{history.error}</small>
      ) : (
        <>
          <div className="detail-info">
            <div>
              <span>پرداخت‌شده</span>
              <b>{toman(history.data.paid_total)}</b>
            </div>
            <div>
              <span>مانده قابل پرداخت</span>
              <b>{history.data.has_unresolved_prices ? "نیازمند تعیین قیمت نهایی" : toman(history.data.remaining_total)}</b>
            </div>
            {pendingTotal > 0 && <div><span>گزارش در انتظار تأیید</span><b>{toman(pendingTotal)}</b></div>}
          </div>
          {history.data.has_unresolved_prices ? <p className="pricing-warning">پیش از ثبت پرداخت، قیمت نهایی همه سرویس‌ها را مشخص کنید.</p> : reportableTotal > 0 ? <form className="employee-form" onSubmit={submit}>
            <label>
              مبلغ
              <input
                type="number"
                min="1"
                max={reportableTotal}
                value={form.amount || String(reportableTotal)}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                required
              />
            </label>
            <label>
              روش پرداخت
              <select
                value={form.payment_method}
                onChange={(event) =>
                  setForm({ ...form, payment_method: event.target.value })
                }
              >
                {Object.entries(paymentMethodNames).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              یادداشت اختیاری
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>
            <button
              className="employee-action"
              disabled={saving || !reportableTotal}
            >
              {saving ? "در حال ثبت..." : "ثبت پرداخت"}
            </button>
            {message && <small className="schedule-message">{message}</small>}
          </form> : <div className={`payment-report-state ${pendingTotal > 0 ? "pending" : "paid"}`}>{pendingTotal > 0 ? "مبلغ کامل گزارش شده و در انتظار تأیید مدیریت است." : "مبلغ کامل پرداخت شده است."}</div>}
          <div className="payment-history">
            {history.data.payments?.map((payment) => (
              <div className="time-off-row" key={payment.id}>
                <b>
                  {toman(payment.amount)} ·{" "}
                  {paymentMethodNames[payment.payment_method]}
                </b>
                <small>
                  {paymentStatusNames[payment.status] || payment.status} ·{" "}
                  {payment.reporter_name || "مدیریت"}
                </small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AppointmentDetail({ item, close, onSaved }) {
  const lines = item.items?.length ? item.items : [item];
  const [activeItemId, setActiveItemId] = useState(lines[0].id);
  const line = lines.find((entry) => entry.id === activeItemId) || lines[0];
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(line.notes || "");
  const [showReason, setShowReason] = useState(false);
  const [actionError, setActionError] = useState("");
  const isFinal = ["completed", "cancelled"].includes(line.completion_status);

  const chooseLine = (entry) => {
    setActiveItemId(entry.id);
    setNotes(entry.notes || "");
    setReason("");
    setShowReason(false);
    setActionError("");
  };
  const act = async (action) => {
    if (action === "cancel" && !reason.trim()) {
      setShowReason(true);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await api.post(`employee/appointment-items/${line.id}/action/`, {
        status: action,
        reason,
        notes,
      });
      onSaved();
    } catch (error) {
      setActionError(errorText(error, "ثبت وضعیت سرویس انجام نشد"));
      setBusy(false);
    }
  };

  return (
    <div className="employee-detail-backdrop" onMouseDown={close}>
      <section className="employee-detail" role="dialog" aria-modal="true" aria-labelledby="employee-appointment-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-top">
          <div><span className="employee-kicker">جزئیات نوبت</span><h2 id="employee-appointment-title">{item.customer_name || item.customer?.name || "مشتری"}</h2></div>
          <button type="button" className="detail-close" aria-label="بستن جزئیات نوبت" onClick={close}>×</button>
        </div>
        <div className="customer-head">
          <div className="customer-avatar">{(item.customer_name || "م")[0]}</div>
          <div><a href={`tel:${item.customer_phone || item.customer?.phone || ""}`}>{item.customer_phone || item.customer?.phone || "شماره ثبت نشده"}</a><small>{lines.length > 1 ? `${new Intl.NumberFormat("fa-IR").format(lines.length)} سرویس در این نوبت` : line.service_name || "سرویس رزرو شده"}</small></div>
        </div>
        {lines.length > 1 && <div className="detail-service-tabs" aria-label="سرویس‌های نوبت">{lines.map((entry) => <button type="button" key={entry.id} className={entry.id === line.id ? "active" : ""} onClick={() => chooseLine(entry)}>{entry.service_name || `سرویس #${entry.service}`}</button>)}</div>}
        <div className="detail-info">
          <div><span>تاریخ</span><b>{formatJalaliDate(line.date, "نامشخص")}</b></div>
          <div><span>ساعت</span><b>{line.start_time?.slice(0, 5)} تا {line.end_time?.slice(0, 5)}</b></div>
          <div><span>سرویس</span><b>{line.service_name || "سرویس رزرو شده"}</b></div>
          <div><span>وضعیت</span><b>{isFinal ? (line.completion_status === "completed" ? "تکمیل شده" : "لغو شده") : statusNames[item.status] || "در انتظار"}</b></div>
        </div>
        {item.notes && <div className="detail-notes">یادداشت مشتری: {item.notes}</div>}
        <details className="employee-detail-section"><summary>مبلغ و پرداخت</summary><div className="detail-price"><ItemPricing key={line.id} item={line} role="employee" onSaved={onSaved} /></div><PaymentReport appointmentId={item.id} /></details>
        <details className="employee-detail-section"><summary>یادداشت کاری</summary><textarea className="employee-note" placeholder="یادداشت‌ها و محصولات مصرف‌شده را ثبت کنید..." value={notes} onChange={(event) => setNotes(event.target.value)} /></details>
        {isFinal ? <div className="detail-final-state">این سرویس قبلاً {line.completion_status === "completed" ? "تکمیل" : "لغو"} شده است.</div> : <div className="detail-buttons"><button disabled={busy} onClick={() => act("complete")}>تکمیل سرویس</button><button className="danger" disabled={busy} onClick={() => setShowReason(true)}>لغو سرویس</button></div>}
        {showReason && !isFinal && <div className="cancel-box"><div><b>لغو این سرویس</b><button type="button" aria-label="بستن فرم لغو" onClick={() => { setShowReason(false); setReason(""); }}>×</button></div><label>دلیل لغو<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="دلیل کوتاه را بنویسید" /></label><button className="employee-action danger" disabled={busy || !reason.trim()} onClick={() => act("cancel")}>{busy ? "در حال ثبت…" : "تأیید لغو"}</button></div>}
        {actionError && <small className="schedule-message" role="alert">{actionError}</small>}
      </section>
    </div>
  );
}
const employeeFinanceGroups = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };
const employeeFinanceMetrics = { commission: "درآمد من", revenue: "درآمد ایجادشده", services: "سرویس‌های تکمیل‌شده", appointments: "نوبت‌های تکمیل‌شده", payments: "پرداخت‌ها" };
function employeeFinanceRange(preset, customStart, customEnd) {
  const current = isoDate(new Date());
  const anchor = new Date(`${current}T12:00:00`);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (preset === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (preset === "month") start.setDate(1);
  if (preset === "last-month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth(), 0, 12);
  }
  if (preset === "custom") return { start: customStart || current, end: customEnd || current };
  return { start: isoDate(start), end: isoDate(end) };
}
function Earnings() {
  const current = isoDate(new Date());
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(current);
  const [customEnd, setCustomEnd] = useState(current);
  const [grouping, setGrouping] = useState("daily");
  const [metric, setMetric] = useState("commission");
  const range = employeeFinanceRange(preset, customStart, customEnd);
  const resource = useData(`employee/earnings/?period=custom&start_date=${range.start}&end_date=${range.end}&group_by=${grouping}`);
  const items = resource.data.services_performed || resource.data.items || [];
  const exportCsv = () => {
    const rows = [
      ["تاریخ", "سرویس", "مبنای کمیسیون", "کمیسیون", "وضعیت کمیسیون"],
      ...items.map((item) => [
        formatJalaliDate(item.date, "—"),
        item.service,
        item.amount ?? item.base_amount,
        item.commission ?? item.employee_commission,
        item.status,
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "employee-earnings.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="employee-page">
      <Heading kicker="مالی شخصی" title="درآمد" />
      <div className="employee-finance-filters">
        <div className="calendar-toggle">{[["day","امروز"],["week","این هفته"],["month","این ماه"],["last-month","ماه قبل"],["custom","بازه دلخواه"]].map(([value, label]) => (
          <button
            key={value}
            className={preset === value ? "active" : ""}
            onClick={() => setPreset(value)}
          >
            {label}
          </button>
        ))}</div>
        {preset === "custom" && <div className="employee-custom-range"><label>از<JalaliDatePicker value={customStart} onChange={setCustomStart} minDate="" /></label><label>تا<JalaliDatePicker value={customEnd} onChange={setCustomEnd} minDate="" /></label></div>}
      </div>
      {resource.loading && <Skeleton />}
      {resource.error && <div className="warning">{resource.error}</div>}
      <div className="employee-finance-stat-grid">
        <section className="employee-card next-card"><span className="employee-kicker">درآمد تأییدشده ایجادشده</span><strong>{toman(resource.data.received || 0)}</strong><p>از پرداخت واقعی؛ کمیسیون من نیست</p></section>
        <section className="employee-card"><span>کمیسیون / درآمد من</span><strong>{toman(resource.data.commission_total || resource.data.employee_commission || 0)}</strong><small>بر اساس نرخ ثبت‌شده</small></section>
        <section className="employee-card"><span>سرویس تکمیل‌شده</span><strong>{new Intl.NumberFormat("fa-IR").format(resource.data.completed_services || 0)}</strong><small>{resource.data.completed_appointments || 0} نوبت تکمیل‌شده</small></section>
        <section className="employee-card"><span>پرداخت مرتبط</span><strong>{new Intl.NumberFormat("fa-IR").format(resource.data.payments_count || 0)}</strong><small>میانگین سهم: {toman(resource.data.average_payment || 0)}</small></section>
        <section className="employee-card"><span>گزارش در انتظار</span><strong>{toman(resource.data.pending_reports || 0)}</strong><small>در انتظار بررسی مدیریت</small></section>
        <section className="employee-card"><span>مانده منتسب به کار من</span><strong>{toman(resource.data.outstanding || 0)}</strong><small>بازپرداخت: {toman(resource.data.refunded || 0)}</small></section>
      </div>
      <PanelDisclosure title="نمودار روند درآمد">
      <section className="employee-card employee-finance-chart">
        <div className="employee-finance-chart-head"><div><span className="employee-kicker">روند مالی</span><h2>{employeeFinanceMetrics[metric]}</h2></div><label>شاخص<select value={metric} onChange={(event) => setMetric(event.target.value)}>{Object.entries(employeeFinanceMetrics).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className="calendar-toggle">{Object.entries(employeeFinanceGroups).map(([value,label]) => <button key={value} className={grouping === value ? "active" : ""} onClick={() => setGrouping(value)}>{label}</button>)}</div>
        {resource.data.series?.length ? <ResponsiveContainer width="100%" height={270}><BarChart data={resource.data.series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => formatJalaliDate(value)} tick={{ fontSize: "var(--text-caption)", fill: "var(--color-text-secondary)" }} /><YAxis tick={{ fontSize: "var(--text-caption)", fill: "var(--color-text-secondary)" }} /><Tooltip labelFormatter={(value) => formatJalaliDate(value)} formatter={(value) => ["commission","revenue"].includes(metric) ? toman(value) : new Intl.NumberFormat("fa-IR").format(value)} /><Bar name={employeeFinanceMetrics[metric]} dataKey={metric} fill="var(--color-chart-1)" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <Empty title="در این بازه داده‌ای برای نمودار نیست" />}
      </section>
      </PanelDisclosure>
      <section className="employee-card employee-service-performance"><div className="day-label"><h2>عملکرد سرویس‌های من</h2><span>بر اساس پرداخت تأییدشده</span></div>{resource.data.services?.length ? resource.data.services.slice(0,8).map((service) => <div key={service.id}><span><b>{service.name}</b><small>{service.paid_services} اجرای پرداخت‌شده</small></span><i><b style={{ width: `${service.share}%` }} /></i><strong>{toman(service.revenue)}</strong></div>) : <Empty title="سرویس پرداخت‌شده‌ای نیست" />}</section>
      <div className="day-label">
        <h2>جزئیات سرویس و کمیسیون</h2>
        <button className="employee-action" onClick={exportCsv}>
          خروجی CSV
        </button>
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : items.length ? (
        items.map((item) => (
          <div className="earning-row" key={item.id}>
            <span>
              <b>{item.service}</b>
              <small>
                {formatJalaliDate(item.date, "—")} · {item.customer ? `${item.customer} · ` : ""}وضعیت: {statusNames[item.status] || item.status} · پرداخت: {paymentStatusNames[item.payment_status] || item.payment_status}
              </small>
            </span>
            <em>{toman(item.amount ?? item.base_amount)}</em>
            <strong>{toman(item.commission ?? item.employee_commission)}</strong>
          </div>
        ))
      ) : (
        <Empty title="هنوز کمیسیونی ثبت نشده" />
      )}
      {resource.data.payments?.length > 0 && <section className="employee-card employee-finance-list"><h2>پرداخت‌های مرتبط با کار من</h2>{resource.data.payments.slice(0,20).map((item) => <article key={item.id}><span><b>{item.customer}</b><small>{item.services?.join("، ")} · {formatJalaliDate(item.date, "—")}</small></span><strong>{toman(item.employee_amount)}</strong><em>{paymentStatusNames[item.status] || item.status}</em></article>)}</section>}
    </div>
  );
}
const weekdays = [
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
  "یکشنبه",
];
function WeeklyScheduleEditor() {
  const schedule = useData("employee/schedule/");
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [savingDay, setSavingDay] = useState(null);
  useEffect(() => {
    if (!schedule.loading)
      setEntries(
        weekdays.map((label, weekday) => {
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
  const change = (weekday, field, value) =>
    setEntries(
      entries.map((entry) =>
        entry.weekday === weekday ? { ...entry, [field]: value } : entry,
      ),
    );
  const save = async (entry) => {
    if (savingDay !== null) return;
    if (entry.is_active && entry.end_time <= entry.start_time) {
      setMessage("ساعت پایان باید بعد از ساعت شروع باشد.");
      return;
    }
    setSavingDay(entry.weekday);
    setMessage("");
    const payload = {
      weekday: entry.weekday,
      start_time: entry.start_time,
      end_time: entry.end_time,
      is_active: entry.is_active,
    };
    try {
      const { data } = entry.id
        ? await api.patch(`employee/schedule/${entry.id}/`, payload)
        : await api.post("employee/schedule/", payload);
      setEntries(current => current.map(row => row.weekday === entry.weekday ? { ...row, id: data.id || entry.id } : row));
      setMessage(`ساعات کاری ${entry.label} ذخیره شد`);
    } catch {
      setMessage("ذخیره ساعات کاری انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setSavingDay(null);
    }
  };
  return (
    <section className="employee-card">
      <h2>ساعات کاری من</h2>
      <p>تغییر هر روز را با دکمه ذخیره همان روز ثبت کنید.</p>
      {schedule.loading ? (
        <Skeleton />
      ) : (
        <div className="weekly-schedule">
          {entries.map((entry) => (
            <div className="weekly-schedule-row" key={entry.weekday}>
              <strong>{entry.label}</strong>
              <label>
                شروع
                <input
                  aria-label={`شروع ${entry.label}`}
                  type="time"
                  value={entry.start_time}
                  onChange={(event) =>
                    change(entry.weekday, "start_time", event.target.value)
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
                    change(entry.weekday, "end_time", event.target.value)
                  }
                />
              </label>
              <label className="schedule-toggle">
                <input
                  aria-label={`فعال ${entry.label}`}
                  type="checkbox"
                  checked={entry.is_active}
                  onChange={(event) =>
                    change(entry.weekday, "is_active", event.target.checked)
                  }
                />
                <span>روز کاری</span>
              </label>
              <button
                className="employee-action"
                type="button"
                disabled={savingDay !== null}
                aria-label={`ذخیره ${entry.label}`}
                onClick={() => save(entry)}
              >
                ذخیره
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <small role="status" className="schedule-message">{message}</small>}
    </section>
  );
}
function Profile() {
  const navigate = useNavigate();
  const profile = useData("employee/profile/");
  const [form, setForm] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const logout = async () => {
    await disableCurrentFirebaseDevice().catch(() => {});
    await logoutSession();
    navigate("/staff/login", { replace: true });
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    const body = new FormData();
    if (form.bio !== undefined) body.append("bio", form.bio);
    if (form.profile_photo instanceof File)
      body.append("profile_photo", form.profile_photo);
    try {
      await api.patch("employee/profile/", body);
      setMessage("پروفایل ذخیره شد");
      setForm({});
      profile.reload();
    } catch (error) {
      setMessage(errorText(error, "ذخیره انجام نشد"));
    } finally {
      setSaving(false);
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      await api.post("employee/password/", passwords);
      setPasswordMessage("رمز عبور با موفقیت تغییر کرد.");
      setPasswords({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      });
    } catch (error) {
      setPasswordMessage(errorText(error, "تغییر رمز عبور انجام نشد"));
    } finally {
      setPasswordSaving(false);
    }
  };
  return (
    <div className="employee-page">
      <Heading kicker="حساب کاربری" title="پروفایل و دسترسی" />
      <section className="employee-card employee-profile-card">
        <div className="employee-profile-identity">
          <div className="employee-profile-photo">
            {profile.data.profile_photo_url || profile.data.profile_photo ? (
              <img
                src={profile.data.profile_photo_url || profile.data.profile_photo}
                alt={`تصویر پروفایل ${profile.data.name || "متخصص"}`}
              />
            ) : (
              <span aria-hidden="true">{(profile.data.name || "ب")[0]}</span>
            )}
          </div>
          <div>
            <span className="employee-kicker">متخصص بهارناژ</span>
            <h2>{profile.data.name || "پروفایل من"}</h2>
            <p>{profile.data.bio || "معرفی کوتاه خود را تکمیل کنید."}</p>
          </div>
        </div>
        <form className="employee-form" onSubmit={save}>
          <label>
            نام نمایشی
            <input value={profile.data.name || ""} readOnly />
          </label>
          <label>
            معرفی کوتاه
            <textarea
              value={form.bio ?? profile.data.bio ?? ""}
              onChange={(event) =>
                setForm({ ...form, bio: event.target.value })
              }
            />
          </label>
          <label className="employee-file-field">
            تصویر پروفایل
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setForm({ ...form, profile_photo: event.target.files[0] })
              }
            />
          </label>
          <button className="employee-action" type="submit" disabled={saving}>
            {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </button>
          {message && <small>{message}</small>}
        </form>
      </section>
      <section className="employee-card">
        <h2>تغییر رمز عبور</h2>
        <form className="employee-form" onSubmit={changePassword}>
          <label>
            رمز عبور فعلی
            <PasswordInput
              visibilityLabel="رمز عبور فعلی"
              autoComplete="current-password"
              value={passwords.current_password}
              onChange={(event) =>
                setPasswords({
                  ...passwords,
                  current_password: event.target.value,
                })
              }
              required
            />
          </label>
          <label>
            رمز عبور جدید
            <PasswordInput
              visibilityLabel="رمز عبور جدید"
              autoComplete="new-password"
              value={passwords.new_password}
              onChange={(event) =>
                setPasswords({ ...passwords, new_password: event.target.value })
              }
              required
            />
          </label>
          <label>
            تکرار رمز عبور جدید
            <PasswordInput
              visibilityLabel="تکرار رمز عبور جدید"
              autoComplete="new-password"
              value={passwords.new_password_confirm}
              onChange={(event) =>
                setPasswords({
                  ...passwords,
                  new_password_confirm: event.target.value,
                })
              }
              required
            />
          </label>
          <button
            className="employee-action"
            type="submit"
            disabled={passwordSaving}
          >
            {passwordSaving ? "در حال ذخیره..." : "تغییر رمز عبور"}
          </button>
          {passwordMessage && <small>{passwordMessage}</small>}
        </form>
      </section>
      <Link className="employee-action" to="/employee/availability">
        مدیریت برنامه کاری
      </Link>
      <section className="employee-card employee-danger-zone">
        <div>
          <h2>خروج از پنل</h2>
          <p>برای ورود دوباره باید نام کاربری و رمز عبور خود را وارد کنید.</p>
        </div>
        <button className="employee-danger" type="button" onClick={logout}>
          خروج از حساب
        </button>
      </section>
    </div>
  );
}
export default function EmployeeApp() {
  return (
    <Routes>
      <Route index element={<DailyWorkspace />} />
      <Route path="appointments/new" element={<NewAppointment />} />
      <Route path="calendar" element={<CalendarWorkspace />} />
      <Route path="earnings" element={<Earnings />} />
      <Route path="availability" element={<Availability />} />
      <Route path="profile" element={<Profile />} />
      <Route path="*" element={<DailyWorkspace />} />
    </Routes>
  );
}
