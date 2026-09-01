import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { toGregorian, toJalaali } from "jalaali-js";
import { JalaliDatePicker } from "../components/DatePicker";
import { api, toman } from "../shared/api";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
const unwrap = (data) => data?.results || data || [];
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
  const [state, setState] = useState({ data: [], loading: true, error: false });
  const reload = () => {
    setState((current) => ({ ...current, loading: true }));
    api
      .get(endpoint)
      .then(({ data }) =>
        setState({ data: unwrap(data), loading: false, error: false }),
      )
      .catch(() => setState({ data: [], loading: false, error: true }));
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
  const appointments = useResource(`admin/appointments/?start_date=${today}&end_date=${today}`);
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
  const statValue = (value) => stats.loading ? "…" : stats.error ? "—" : value || 0;
  return (
    <div className="admin-page">
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
        <Stat label="نوبت‌های این ماه" value={statValue(stats.data.month?.appointments)} />
        <Stat
          label="درخواست‌های در انتظار"
          value={statValue(todayStats.pending)}
        />
      </div>
      <div className="admin-stat-grid">
        <Stat label="درآمد خالص امروز" value={stats.loading ? "…" : toman(stats.data.revenue?.today)} accent />
        <Stat label="درآمد خالص این هفته" value={stats.loading ? "…" : toman(stats.data.revenue?.week)} />
        <Stat label="درآمد خالص این ماه" value={stats.loading ? "…" : toman(stats.data.revenue?.month)} />
        <Stat label="تأییدشده امروز" value={statValue(todayStats.confirmed)} />
      </div>
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
            <Empty title="دریافت نوبت‌های امروز انجام نشد" text="لطفاً دوباره تلاش کنید." />
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
              نوبت‌های انجام‌شده{" "}
              <b>{todayStats.completed || 0}</b>
            </span>
            <span>
              لغوشده{" "}
              <b>{todayStats.cancelled || 0}</b>
            </span>
          </div>
        </section>
      </div>
      <div className="admin-grid-two">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>عملکرد</span>
              <h2>محبوب‌ترین خدمات</h2>
            </div>
          </div>
          {stats.loading ? (
            <Skeleton count={5} />
          ) : stats.error ? (
            <Empty title="دریافت آمار خدمات انجام نشد" />
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
                      {item.changed_at || item.created_at || "اخیراً"}
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
      <div className="quick-actions">
        <Link to="/admin/appointments">＋ افزودن نوبت</Link>
        <Link to="/admin/employees">＋ افزودن کارمند</Link>
        <Link to="/admin/services">＋ افزودن خدمت</Link>
      </div>
    </div>
  );
}
function AppointmentRow({ item, onClick }) {
  const line = item.items?.[0] || item;
  const details = item.items?.map((entry) => `${entry.service_name} · ${entry.employee_name}`).join("، ") || line.service_name;
  return (
    <button className="appointment-row" onClick={onClick}>
      <span className="time">{line.start_time || "--:--"}</span>
      <span>
        <b>{item.customer_name || item.customer?.name || `رزرو #${item.id}`}</b>
        <small>
          {details || `نوبت ${item.items?.length || 1} خدمت`}
        </small>
      </span>
      <em className={`status ${item.status}`}>
        {labels[item.status] || item.status}
      </em>
    </button>
  );
}

function Appointments() {
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
  const query = new URLSearchParams({ start_date: range.start, end_date: range.end, ...(status !== "all" && { status }), ...(employee && { employee }), ...(service && { service }) });
  const resource = useResource(`admin/appointments/?${query}`);
  const selectedAppointments = resource.data.filter((item) => item.items?.some((line) => line.date === selectedDate));
  const moveMonth = (direction) => {
    const value = new Date(`${visibleMonth}T12:00:00`);
    const current = toJalaali(value.getFullYear(), value.getMonth() + 1, value.getDate());
    const monthIndex = current.jm - 1 + direction;
    const jy = current.jy + Math.floor(monthIndex / 12);
    const jm = ((monthIndex % 12) + 12) % 12 + 1;
    const nextMonth = toGregorian(jy, jm, 1);
    const next = `${nextMonth.gy}-${String(nextMonth.gm).padStart(2, "0")}-${String(nextMonth.gd).padStart(2, "0")}`;
    setVisibleMonth(next);
    setSelectedDate(next);
  };
  const selectToday = () => { setSelectedDate(today); setVisibleMonth(`${today.slice(0, 7)}-01`); };
  return (
    <div className="admin-page">
      <Header eyebrow="مدیریت نوبت‌ها" title="نوبت‌ها" action="افزودن نوبت" onAction={() => setCreateOpen(true)} />
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">همه وضعیت‌ها</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="filter-button" onClick={() => setFiltersOpen(!filtersOpen)}>فیلترها</button>
      </div>
      {filtersOpen && <div className="toolbar">
        <select aria-label="فیلتر متخصص" value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">همه متخصصان</option>{employees.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="فیلتر خدمت" value={service} onChange={(event) => setService(event.target.value)}><option value="">همه خدمات</option>{services.data.map((item) => <option key={item.id} value={item.id}>{item.persian_name || item.name}</option>)}</select>
      </div>}
      <AppointmentCalendar visibleMonth={visibleMonth} selectedDate={selectedDate} appointments={resource.data} loading={resource.loading} error={resource.error} onPrevious={() => moveMonth(-1)} onNext={() => moveMonth(1)} onToday={selectToday} onSelect={(date) => { setSelectedDate(date); const chosen = new Date(`${date}T12:00:00`); const shown = new Date(`${visibleMonth}T12:00:00`); const chosenJalali = toJalaali(chosen.getFullYear(), chosen.getMonth() + 1, chosen.getDate()); const shownJalali = toJalaali(shown.getFullYear(), shown.getMonth() + 1, shown.getDate()); if (chosenJalali.jy !== shownJalali.jy || chosenJalali.jm !== shownJalali.jm) setVisibleMonth(date); }} />
      <section className="admin-panel calendar-panel">
        <div className="calendar-strip"><strong>{new Intl.DateTimeFormat("fa-IR", { weekday: "long", month: "long", year: "numeric", day: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))}</strong><span>{employees.data.length} متخصص فعال · {services.data.length} خدمت</span></div>
        {resource.loading ? <Skeleton count={7} /> : resource.error ? <Empty title="دریافت نوبت‌های تقویم انجام نشد" text="لطفاً دوباره تلاش کنید." /> : selectedAppointments.length ? <div className="appointment-table">{selectedAppointments.map((item) => <AppointmentRow item={item} key={item.id} onClick={() => setSelected(item)} />)}</div> : <Empty title="برای این روز نوبتی ثبت نشده است" text="روز دیگری را انتخاب کنید یا یک رزرو تازه بسازید." />}
      </section>
      <Toast message={toast} />
      {createOpen && <AdminAppointmentForm close={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); resource.reload(); setToast("نوبت ثبت شد"); }} />}
      {selected && <AppointmentDrawer item={selected} close={() => setSelected(null)} onSaved={() => { setSelected(null); resource.reload(); setToast("نوبت به‌روزرسانی شد"); }} />}
    </div>
  );
}
function AppointmentCalendar({ visibleMonth, selectedDate, appointments, loading, error, onSelect, onPrevious, onNext, onToday }) {
  const value = new Date(`${visibleMonth}T12:00:00`);
  const jalali = toJalaali(value.getFullYear(), value.getMonth() + 1, value.getDate());
  const first = toGregorian(jalali.jy, jalali.jm, 1);
  const start = new Date(first.gy, first.gm - 1, first.gd);
  start.setDate(start.getDate() - start.getDay());
  return (
    <section className="admin-panel appointment-calendar">
      <div className="panel-title"><div><span>تقویم شمسی</span><h2>{new Intl.NumberFormat("fa-IR").format(jalali.jy)} / {new Intl.NumberFormat("fa-IR").format(jalali.jm)}</h2></div><div className="calendar-month-actions"><button type="button" aria-label="ماه قبل" onClick={onPrevious}>‹</button><button type="button" onClick={onToday}>امروز</button><button type="button" aria-label="ماه بعد" onClick={onNext}>›</button></div></div>
      <div className="appointment-calendar-weekdays">{["ی", "د", "س", "چ", "پ", "ج", "ش"].map((day) => <b key={day}>{day}</b>)}</div>
      {loading ? <Skeleton count={6} /> : error ? <Empty title="دریافت تقویم انجام نشد" /> : <div className="appointment-calendar-days">{Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start); day.setDate(start.getDate() + index);
        const iso = localIsoDate(day);
        const local = toJalaali(day.getFullYear(), day.getMonth() + 1, day.getDate());
        const dayAppointments = appointments.filter((item) => item.items?.some((line) => line.date === iso));
        const serviceCounts = {};
        dayAppointments.forEach((item) => item.items?.filter((line) => line.date === iso).forEach((line) => { serviceCounts[line.service_name] = (serviceCounts[line.service_name] || 0) + 1; }));
        const services = Object.entries(serviceCounts);
        return <button type="button" aria-label={iso} key={iso} className={[iso === selectedDate && "selected", iso === today && "today", (local.jy !== jalali.jy || local.jm !== jalali.jm) && "muted"].filter(Boolean).join(" ")} onClick={() => onSelect(iso)}><span className="calendar-day-number">{new Intl.NumberFormat("fa-IR").format(local.jd)}</span><span className="calendar-day-badges">{services.slice(0, 2).map(([name, count]) => <small key={name}>{name} {new Intl.NumberFormat("fa-IR").format(count)}</small>)}{services.length > 2 && <small>+{new Intl.NumberFormat("fa-IR").format(services.length - 2)}</small>}</span>{dayAppointments.length > 0 && <b>{new Intl.NumberFormat("fa-IR").format(dayAppointments.length)} نوبت</b>}</button>;
      })}</div>}
    </section>
  );
}
function localIsoDate(value) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function calendarRange(month) { const value = new Date(`${month}T12:00:00`); const jalali = toJalaali(value.getFullYear(), value.getMonth() + 1, value.getDate()); const first = toGregorian(jalali.jy, jalali.jm, 1); const start = new Date(first.gy, first.gm - 1, first.gd); start.setDate(start.getDate() - start.getDay()); const end = new Date(start); end.setDate(end.getDate() + 41); return { start: localIsoDate(start), end: localIsoDate(end) }; }
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
    <div className="modal-backdrop" onMouseDown={close}>
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
          <legend>خدمات و متخصصان</legend>
          {selections.map((selection, index) => (
            <div className="appointment-line" key={index}>
              <label>
                خدمت
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
                aria-label="حذف خدمت"
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
            افزودن خدمت
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
    </div>
  );
}
function AppointmentDrawer({ item, close, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({ amount: item.remaining_total || "", payment_method: "cash", notes: "" });
  const [refund, setRefund] = useState({ payment: "", amount: "", reason: "" });
  const [financeError, setFinanceError] = useState("");
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
    <div className="drawer-backdrop" onMouseDown={close}>
      <aside
        className="admin-drawer"
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
        <div className="drawer-section">
          <h3>خدمات رزرو</h3>
          {item.items?.length ? (
            item.items.map((line) => (
              <div className="drawer-item" key={line.id}>
                <b>{line.service_name || `خدمت #${line.service}`}</b>
                <span>
                  {line.date} · {line.start_time} تا {line.end_time}
                </span>
                <em>{toman(line.price_snapshot)}</em>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </div>
        <div className="drawer-actions">
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
        </div>
        <div className="drawer-section">
          <h3>وضعیت مالی</h3>
          <div className="mini-summary">
            <span>مبلغ نوبت<b>{toman(item.appointment_total)}</b></span>
            <span>پرداخت‌شده<b>{toman(item.net_paid)}</b></span>
            <span>مانده<b>{toman(item.remaining_total)}</b></span>
          </div>
          <p className="drawer-meta">وضعیت: {item.payment_status || "unpaid"}</p>
          <form className="employee-form" onSubmit={recordPayment}>
            <label>
              مبلغ پرداخت
              <input
                type="number"
                min="1"
                max={item.remaining_total}
                value={payment.amount}
                onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
                required
              />
            </label>
            <label>
              روش پرداخت
              <select
                value={payment.payment_method}
                onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })}
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
              <input value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} />
            </label>
            <button className="admin-primary" disabled={saving || !item.remaining_total}>ثبت پرداخت</button>
          </form>
          {item.payments?.map((entry) => (
            <div className="drawer-item" key={entry.id}>
              <b>{toman(entry.amount)} · {entry.payment_method}</b>
              <span>{entry.status} · بازپرداخت {toman(entry.refunded_total)}</span>
              <button
                type="button"
                onClick={() => setRefund({ ...refund, payment: entry.id, amount: entry.amount - entry.refunded_total })}
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
                  onChange={(event) => setRefund({ ...refund, amount: event.target.value })}
                  required
                />
              </label>
              <label>
                دلیل
                <input value={refund.reason} onChange={(event) => setRefund({ ...refund, reason: event.target.value })} />
              </label>
              <button className="admin-primary" disabled={saving}>ثبت بازپرداخت</button>
            </form>
          )}
          {financeError && <small className="admin-field-error">{financeError}</small>}
        </div>
        <div className="drawer-section">
          <h3>تاریخچه وضعیت</h3>
          {item.status_history?.length ? (
            item.status_history.map((history) => (
              <p className="history-row" key={history.id}>
                <b>{labels[history.status] || history.status}</b>
                <span>{history.reason || "بدون توضیح"}</span>
              </p>
            ))
          ) : (
            <Empty title="تاریخچه‌ای ثبت نشده" />
          )}
        </div>
      </aside>
    </div>
  );
}

function CrudPage({
  type,
  endpoint,
  title,
  eyebrow,
  fields = [],
  uploads = false,
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
  }, [endpoint]);
  const createOption = async (field) => {
    const name = (optionDrafts[field.name] || "").trim();
    if (!name) {
      setOptionErrors({ ...optionErrors, [field.name]: "نام دسته‌بندی را وارد کنید" });
      return;
    }
    setOptionSaving({ ...optionSaving, [field.name]: true });
    setOptionErrors({ ...optionErrors, [field.name]: "" });
    try {
      const { data } = await api.post(field.createEndpoint, { name });
      setOptions({ ...options, [field.name]: [...(options[field.name] || []), data] });
      setForm({ ...form, [field.name]: data.id });
      setOptionDrafts({ ...optionDrafts, [field.name]: "" });
    } catch (error) {
      const detail = error.response?.data?.name || error.response?.data?.detail;
      setOptionErrors({ ...optionErrors, [field.name]: Array.isArray(detail) ? detail.join(" ") : detail || "ثبت دسته‌بندی انجام نشد" });
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
        .filter(([name, value]) => !["id", "image_url", "category_name", "created_at"].includes(name) && value !== "" && value !== undefined)
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
      const detail = error.response?.data?.detail || Object.values(error.response?.data || {})[0];
      setToast(Array.isArray(detail) ? detail.join(" ") : detail || "ذخیره اطلاعات انجام نشد");
    } finally {
      setSaving(false);
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
          <input placeholder={`جست‌وجو در ${title}`} />
          <span>{resource.data.length} مورد</span>
        </div>
        {resource.loading ? (
          <Skeleton count={6} />
        ) : resource.data.length ? (
          <div className="entity-list">
            {resource.data.map((item) => (
              <article key={item.id}>
                <div className="entity-avatar">
                  {(item.persian_name || item.name || item.title || "ب")[0]}
                </div>
                <div>
                  <b>
                    {item.persian_name ||
                      item.name ||
                      item.title ||
                      `مورد #${item.id}`}
                  </b>
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
                <button
                  onClick={() => {
                    setForm(item);
                    setOpen(true);
                  }}
                >
                  ویرایش
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={`${title} خالی است`}
            text={`برای شروع، اولین ${type} را اضافه کنید.`}
          />
        )}
      </section>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <form
            className="admin-modal"
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
                <label key={field.name}>
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
                            onChange={(event) => setOptionDrafts({ ...optionDrafts, [field.name]: event.target.value })}
                          />
                          <button type="button" disabled={optionSaving[field.name]} onClick={() => createOption(field)}>
                            {optionSaving[field.name] ? "در حال ذخیره..." : "+ افزودن دسته‌بندی جدید"}
                          </button>
                          {optionErrors[field.name] && <small className="admin-field-error">{optionErrors[field.name]}</small>}
                        </span>
                      )}
                    </>
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
        </div>
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
const scheduleWeekdays = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"];

function EmployeeScheduleModal({ employee, close }) {
  const schedule = useResource(`admin/working-schedules/?employee=${employee.id}`);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!schedule.loading) setEntries(scheduleWeekdays.map((label, weekday) => {
      const entry = schedule.data.find((item) => item.weekday === weekday);
      return { id: entry?.id, weekday, label, start_time: entry?.start_time?.slice(0, 5) || "09:00", end_time: entry?.end_time?.slice(0, 5) || "17:00", is_active: entry?.is_active ?? false };
    }));
  }, [schedule.data, schedule.loading]);
  const update = (weekday, field, value) => setEntries(entries.map((entry) => entry.weekday === weekday ? { ...entry, [field]: value } : entry));
  const save = async (entry) => {
    const payload = { employee: employee.id, weekday: entry.weekday, start_time: entry.start_time, end_time: entry.end_time, is_active: entry.is_active };
    try {
      if (entry.id) await api.patch(`admin/working-schedules/${entry.id}/`, payload);
      else await api.post("admin/working-schedules/", payload);
      setMessage("ساعات کاری ذخیره شد");
      schedule.reload();
    } catch { setMessage("ذخیره ساعات کاری انجام نشد"); }
  };
  return <div className="modal-backdrop" onMouseDown={close}><section className="admin-modal admin-schedule-modal" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="drawer-close" onClick={close}>×</button><span className="admin-kicker">برنامه کاری {employee.name}</span><h2>ویرایش ساعات کاری</h2>{schedule.loading ? <Skeleton /> : <div className="admin-weekly-schedule">{entries.map((entry) => <div className="admin-weekly-schedule-row" key={entry.weekday}><strong>{entry.label}</strong><label>شروع<input aria-label={`شروع ${entry.label}`} type="time" value={entry.start_time} onChange={(event) => update(entry.weekday, "start_time", event.target.value)} /></label><label>پایان<input aria-label={`پایان ${entry.label}`} type="time" value={entry.end_time} onChange={(event) => update(entry.weekday, "end_time", event.target.value)} /></label><label className="check-label"><input aria-label={`فعال ${entry.label}`} type="checkbox" checked={entry.is_active} onChange={(event) => update(entry.weekday, "is_active", event.target.checked)} /> فعال</label><button className="admin-primary" type="button" onClick={() => save(entry)}>ذخیره</button></div>)}</div>}{message && <small className="admin-schedule-message">{message}</small>}</section></div>;
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
          (Array.isArray(value) ? value : []).forEach((serviceId) => body.append("services", serviceId));
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
        onAction={() => { setMode("new"); setEditing(null); setForm({ is_active: true }); setErrors({}); setOpen(true); }}
      />
      <section className="admin-panel">
        <div className="list-toolbar">
          <input placeholder="جست‌وجو در کارمندان" />
          <span>{resource.data.length} مورد</span>
        </div>
        {resource.loading ? (
          <Skeleton count={6} />
        ) : resource.data.length ? (
          <div className="entity-list">
            {resource.data.map((employee) => (
              <article key={employee.id}>
                <div className="entity-avatar">{(employee.name || "ب")[0]}</div>
                <div>
                  <b>{employee.name}</b>
                  <small>{employee.specialty || "تخصص ثبت نشده"}</small>
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
                <button onClick={() => setScheduleEmployee(employee)}>ویرایش ساعات کاری</button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="کارمندی ثبت نشده" />
        )}
      </section>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <form
            className="admin-modal"
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
                  <input
                    type="password"
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
            <fieldset className="admin-service-picker">
              <legend>خدمات قابل ارائه</legend>
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
            {errors.detail && <small className="admin-field-error">{errors.detail}</small>}
            <button className="admin-primary" type="submit" disabled={saving}>
              {saving ? "در حال ذخیره..." : editing ? "ذخیره تغییرات" : "ایجاد کارمند"}
            </button>
          </form>
        </div>
      )}
      {scheduleEmployee && <EmployeeScheduleModal employee={scheduleEmployee} close={() => setScheduleEmployee(null)} />}
      <Toast message={toast} type="success" />
    </div>
  );
}
function Finance() {
  const payments = useResource("admin/payments/");
  const refunds = useResource("admin/refunds/");
  const transactions = useResource("admin/transactions/");
  const commissions = useResource("admin/commissions/");
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [reviewError, setReviewError] = useState("");
  const reviewPayment = async (payment, action) => {
    setReviewingPayment(payment.id);
    setReviewError("");
    try {
      await api.post(`admin/payments/${payment.id}/${action}/`);
      payments.reload();
      transactions.reload();
    } catch (error) {
      setReviewError(firstError(error, "بررسی پرداخت انجام نشد"));
    } finally {
      setReviewingPayment(null);
    }
  };
  const section = (title, resource, render) => (
    <section className="admin-panel">
      <div className="panel-title">
        <div>
          <span>حسابداری</span>
          <h2>{title}</h2>
        </div>
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <Empty title="دریافت اطلاعات انجام نشد" />
      ) : resource.data.length ? (
        <div className="entity-list">{resource.data.map(render)}</div>
      ) : (
        <Empty />
      )}
    </section>
  );
  return (
    <div className="admin-page">
      <Header eyebrow="حسابداری" title="مالی و پرداخت‌ها" />
      <div className="admin-grid-two">
        {section("پرداخت‌ها", payments, (item) => (
          <article key={item.id}>
            <div className="entity-avatar">پ</div>
            <div>
              <b>{toman(item.amount)}</b>
              <small>نوبت #{item.appointment} · {item.customer_name || "مشتری"} · {item.payment_method}</small>
              {item.created_by && <small>گزارش‌دهنده: {item.reporter_name || "کارمند"}</small>}
            </div>
            <span>{item.status === "pending" ? "در انتظار تأیید" : item.status === "paid" ? "تأیید شده" : item.status === "failed" ? "رد شده" : item.status}</span>
            {item.status === "pending" && (
              <div className="finance-review-actions">
                <button className="admin-primary" disabled={reviewingPayment === item.id} onClick={() => reviewPayment(item, "confirm")}>تأیید</button>
                <button className="admin-secondary" disabled={reviewingPayment === item.id} onClick={() => reviewPayment(item, "reject")}>رد</button>
              </div>
            )}
          </article>
        ))}
        {reviewError && <small className="admin-field-error">{reviewError}</small>}
        {section("بازپرداخت‌ها", refunds, (item) => (
          <article key={item.id}>
            <div className="entity-avatar">ب</div>
            <div>
              <b>{toman(item.amount)}</b>
              <small>{item.reason || `پرداخت #${item.payment}`}</small>
            </div>
            <span>{item.status}</span>
          </article>
        ))}
      </div>
      <div className="admin-grid-two">
        {section("تراکنش‌های تغییرناپذیر", transactions, (item) => (
          <article key={item.id}>
            <div className="entity-avatar">ت</div>
            <div>
              <b>{toman(item.amount)}</b>
              <small>{item.description || `نوبت #${item.appointment}`}</small>
            </div>
            <span>{item.type}</span>
          </article>
        ))}
        {section("کمیسیون متخصصان", commissions, (item) => (
          <article key={item.id}>
            <div className="entity-avatar">ک</div>
            <div>
              <b>{item.employee_name || `متخصص #${item.employee}`}</b>
              <small>{item.service_name} · پایه {toman(item.base_amount)}</small>
            </div>
            <span>{toman(item.commission_amount)} · {item.status}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
function Content() {
  return (
    <CrudPage
      type="بخش محتوا"
      endpoint="admin/gallery/"
      title="محتوا و گالری"
      eyebrow="انتشارات"
      uploads
      fields={[
        ["title", "عنوان"],
        {
          name: "category",
          label: "دسته‌بندی",
          type: "select",
          optionsEndpoint: "admin/gallery-categories/",
          createEndpoint: "admin/gallery-categories/",
        },
        ["image", "تصویر", "file"],
        ["description", "توضیحات"],
        ["display_order", "ترتیب نمایش", "number"],
      ]}
    />
  );
}
function AdminRouter() {
  return (
    <Routes>
      <Route index element={<DashboardHome />} />
      <Route path="appointments" element={<Appointments />} />
      <Route path="employees" element={<EmployeeManagement />} />
      <Route
        path="services"
        element={
          <CrudPage
            type="خدمت"
            endpoint="admin/services/"
            title="مدیریت خدمات"
            eyebrow="کاتالوگ"
            fields={[
              { name: "persian_name", label: "نام فارسی" },
              { name: "name", label: "نام داخلی" },
              {
                name: "category",
                label: "دسته‌بندی",
                type: "select",
                optionsEndpoint: "admin/service-categories/",
              },
              { name: "price", label: "قیمت", type: "number" },
              { name: "duration", label: "مدت (دقیقه)", type: "number" },
            ]}
          />
        }
      />
      <Route
        path="customers"
        element={
          <CrudPage
            type="مشتری"
            endpoint="admin/users/"
            title="مدیریت مشتریان"
            eyebrow="ارتباط با مشتری"
            fields={[
              { name: "first_name", label: "نام" },
              { name: "last_name", label: "نام خانوادگی" },
              { name: "phone", label: "شماره تماس" },
            ]}
          />
        }
      />
      <Route path="finance" element={<Finance />} />
      <Route path="content" element={<Content />} />
      <Route path="*" element={<DashboardHome />} />
    </Routes>
  );
}
export default AdminRouter;
