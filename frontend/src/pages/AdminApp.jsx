import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { toGregorian, toJalaali } from "jalaali-js";
import { JalaliDatePicker } from "../components/DatePicker";
import { api, toman } from "../shared/api";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
}).format(new Date());
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
        <Stat
          label="نوبت‌های این ماه"
          value={statValue(stats.data.month?.appointments)}
        />
        <Stat
          label="درخواست‌های در انتظار"
          value={statValue(todayStats.pending)}
        />
      </div>
      <div className="admin-stat-grid">
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
      <div className="admin-grid-two">
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
            {new Intl.DateTimeFormat("fa-IR", {
              weekday: "long",
              month: "long",
              year: "numeric",
              day: "numeric",
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
                  {new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(
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
    </div>
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
    <div className="drawer-backdrop" onMouseDown={close}>
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
        <div className="appointment-summary-bar"><span className={`status ${item.status}`}>{labels[item.status]}</span><b>{item.items?.[0]?.date} · {item.items?.[0]?.start_time?.slice(0,5)}</b><span>{item.items?.length || 0} سرویس</span></div>
        {isCancelled && <section className="cancellation-card"><span>لغو شده</span><h3>{item.status === "cancelled" ? "این نوبت لغو شده است" : `${cancelledLine?.service_name || "یک سرویس"} از این نوبت لغو شده است`}</h3><dl><div><dt>لغو توسط</dt><dd>{cancellation?.changed_by_name || "ثبت نشده"}{cancellation?.changed_by_role === "employee" ? " (متخصص)" : ""}</dd></div><div><dt>زمان لغو</dt><dd>{cancellation?.changed_at ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(cancellation.changed_at)) : "ثبت نشده"}</dd></div><div><dt>دلیل</dt><dd>{cancellation?.reason || "دلیلی ثبت نشده است."}</dd></div></dl></section>}
        <div className="drawer-section">
          <h3>سرویس‌های رزرو</h3>
          {item.items?.length ? (
            item.items.map((line) => (
              <div className="drawer-item" key={line.id}>
                <b>{line.service_name || `سرویس #${line.service}`}</b>
                <span>
                  {line.date} · {line.start_time} تا {line.end_time}
                </span>
                <em>{toman(line.price_snapshot)}</em>
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
              مبلغ نوبت<b>{toman(item.appointment_total)}</b>
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
              disabled={saving || !item.remaining_total}
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
        <div className="drawer-section">
          <h3>تاریخچه وضعیت</h3>
          {item.status_history?.length ? (
            item.status_history.map((history) => (
              <p className="history-row" key={history.id}>
                <b>{labels[history.status] || history.status}</b>
                <span>{history.changed_by_name || "سیستم"} · {history.changed_at ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(history.changed_at)) : ""}<br />{history.reason || "بدون توضیح"}</span>
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
    <div className="modal-backdrop" onMouseDown={close}>
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
    </div>
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
                <button onClick={() => setScheduleEmployee(employee)}>
                  ویرایش ساعات کاری
                </button>
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
        </div>
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
  const [form, setForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [imageAlt, setImageAlt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const openNew = () => {
    setForm({ category: "", name: "", persian_name: "", short_description: "", description: "", price: "", duration: "", slug: "", seo_title: "", seo_description: "", is_active: true, is_bookable: true, is_featured: false });
    setFiles([]);
    setImageAlt("");
    setMessage("");
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
    const payload = Object.fromEntries(Object.entries(form).filter(([key]) => !["id", "images", "employees", "category_name", "is_deleted"].includes(key)));
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
        <div><b>{service.persian_name || service.name}</b><small>{service.short_description || service.description || "محتوای صفحه هنوز کامل نشده است."}</small></div>
        <span className={`finance-badge ${service.is_active ? "paid" : "failed"}`}>{service.is_active ? "منتشرشده" : "غیرفعال"}</span>
        <button className="admin-secondary" onClick={() => { setForm(service); setFiles([]); setImageAlt(""); setMessage(""); }}>ویرایش صفحه</button>
      </article>)}</div>}
    </section>
    {form && <div className="modal-backdrop" onMouseDown={() => setForm(null)}><form className="admin-modal service-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="drawer-close" onClick={() => setForm(null)}>×</button>
      <span className="admin-kicker">{form.id ? "ویرایش مقاله سرویس" : "سرویس جدید"}</span><h2>{form.persian_name || "محتوای سرویس"}</h2>
      <fieldset><legend>اطلاعات اصلی</legend><div className="service-editor-grid">
        <label>نام فارسی<input required value={form.persian_name || ""} onChange={(event) => update("persian_name", event.target.value)} /></label>
        <label>نام داخلی<input required value={form.name || ""} onChange={(event) => update("name", event.target.value)} /></label>
        <label>دسته‌بندی<select required value={form.category || ""} onChange={(event) => update("category", event.target.value)}><option value="">انتخاب کنید</option>{categories.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>آدرس سرویس (slug)<input dir="ltr" value={form.slug || ""} onChange={(event) => update("slug", event.target.value)} /><small>تغییر این مقدار، آدرس عمومی سرویس را تغییر می‌دهد.</small></label>
      </div></fieldset>
      <fieldset><legend>محتوای صفحه سرویس</legend><label>معرفی کوتاه<textarea maxLength="320" value={form.short_description || ""} onChange={(event) => update("short_description", event.target.value)} /></label><label>متن کامل مقاله<textarea className="service-article-input" value={form.description || ""} onChange={(event) => update("description", event.target.value)} /></label></fieldset>
      <fieldset><legend>تصاویر</legend>{form.images?.length > 0 && <div className="service-image-admin-grid">{form.images.map((image) => <div key={image.id}><img src={image.image_url} alt={image.alt_text || ""} /><span>{image.alt_text || "بدون متن جایگزین"}</span><button type="button" className="admin-danger" onClick={() => removeImage(image.id)}>حذف تصویر</button></div>)}</div>}<label>افزودن تصاویر<input type="file" accept="image/*" multiple onChange={(event) => setFiles([...event.target.files])} /></label><label>توضیح تصاویر جدید<input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="مثلاً نمونه مانیکور در بهارناژ" /></label></fieldset>
      <fieldset><legend>قیمت و مدت</legend><div className="service-editor-grid"><label>قیمت (تومان)<input required min="0" type="number" value={form.price || ""} onChange={(event) => update("price", event.target.value)} /></label><label>مدت (دقیقه)<input required min="1" type="number" value={form.duration || ""} onChange={(event) => update("duration", event.target.value)} /></label></div></fieldset>
      <fieldset><legend>SEO</legend><label>عنوان سئو<input value={form.seo_title || ""} onChange={(event) => update("seo_title", event.target.value)} /></label><label>توضیحات سئو<textarea value={form.seo_description || ""} onChange={(event) => update("seo_description", event.target.value)} /></label></fieldset>
      <fieldset><legend>وضعیت انتشار</legend><div className="service-status-controls"><label><input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => update("is_active", event.target.checked)} /> فعال</label><label><input type="checkbox" checked={Boolean(form.is_bookable)} onChange={(event) => update("is_bookable", event.target.checked)} /> قابل رزرو</label><label><input type="checkbox" checked={Boolean(form.is_featured)} onChange={(event) => update("is_featured", event.target.checked)} /> ویژه</label></div></fieldset>
      {message && <small className="admin-field-error">{message}</small>}<button className="admin-primary" disabled={saving}>{saving ? "در حال ذخیره…" : "ذخیره صفحه سرویس"}</button>
    </form></div>}
  </div>;
}

const paymentLabels = { pending: "در انتظار تأیید", paid: "تأیید شده", failed: "رد شده", refunded: "بازپرداخت شده" };
const appointmentPaymentLabels = { unpaid: "پرداخت‌نشده", partially_paid: "پرداخت جزئی", paid: "تسویه‌شده", partially_refunded: "بازپرداخت جزئی", refunded: "بازپرداخت‌شده" };
const methodLabels = { cash: "نقدی", card: "کارت", bank_transfer: "انتقال بانکی", online: "آنلاین", other: "سایر" };
const transactionLabels = { payment: "پرداخت", refund: "بازپرداخت", commission: "کمیسیون", expense: "هزینه" };
const chartColors = ["#2d7d70", "#d5a26d", "#7c9b91", "#b75d55", "#8c72a6"];
const financeGroups = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };
const adminChartMetrics = { revenue: "درآمد خالص", payments: "تعداد پرداخت‌ها", appointments: "نوبت‌های تکمیل‌شده", commission: "کمیسیون", average_payment: "میانگین پرداخت" };
const employeeChartMetrics = { revenue: "درآمد خالص", payments: "تعداد پرداخت‌ها", appointments: "نوبت‌های تکمیل‌شده", commission: "کمیسیون", services: "سرویس‌های تکمیل‌شده" };

function financeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(date);
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
  return <ResponsiveContainer width="100%" height={height}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => monetary ? toman(value) : new Intl.NumberFormat("fa-IR").format(value)} /><Bar name={metrics[metric]} dataKey={metric} fill="#2d7d70" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
}

function FinancePresetFilter({ preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd }) {
  return <div className="finance-modal-range">
    <div className="segmented">{[["day","امروز"],["week","این هفته"],["month","این ماه"],["last-month","ماه قبل"],["custom","بازه دلخواه"]].map(([value,label]) => <button type="button" key={value} className={preset === value ? "selected" : ""} onClick={() => setPreset(value)}>{label}</button>)}</div>
    {preset === "custom" && <div className="finance-custom-range"><label>از<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>تا<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}
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
  return <div className="modal-backdrop employee-finance-backdrop" onMouseDown={onClose}><section className="admin-modal employee-finance-modal" role="dialog" aria-modal="true" aria-labelledby="employee-finance-title" onMouseDown={(event) => event.stopPropagation()}>
    <button type="button" className="drawer-close" onClick={onClose}>×</button>
    <header className="employee-finance-profile">{profile.profile_photo_url ? <img src={profile.profile_photo_url} alt={`تصویر ${profile.name}`} /> : <span>{profile.name?.[0] || "م"}</span>}<div><small>گزارش مالی متخصص</small><h2 id="employee-finance-title">{profile.name}</h2><p>{profile.specialty || "متخصص بهارناژ"}</p></div></header>
    <FinancePresetFilter {...{ preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd }} />
    {report.loading ? <Skeleton /> : report.error ? <Empty title="دریافت گزارش مالی انجام نشد" /> : <>
      <div className="employee-finance-stats"><Stat label="درآمد تأییدشده" value={toman(data.received || 0)} note={`خالص: ${toman(data.net_revenue || 0)}`} accent /><Stat label="کمیسیون" value={toman(data.commission_total || 0)} note="مجزا از درآمد سالن" /><Stat label="سرویس تکمیل‌شده" value={new Intl.NumberFormat("fa-IR").format(data.completed_services || 0)} note={`${data.completed_appointments || 0} نوبت`} /><Stat label="میانگین پرداخت" value={toman(data.average_payment || 0)} note={`${data.payments_count || 0} پرداخت`} /><Stat label="گزارش در انتظار" value={toman(data.pending_reports || 0)} note="نیازمند بررسی" /><Stat label="مانده منتسب" value={toman(data.outstanding || 0)} note={`بازپرداخت: ${toman(data.refunded || 0)}`} /></div>
      <section className="admin-panel finance-chart employee-modal-chart"><div className="panel-title"><div><span>روند عملکرد</span><h3>{employeeChartMetrics[metric]}</h3></div></div><FinanceChartControls grouping={grouping} onGrouping={setGrouping} metric={metric} onMetric={setMetric} metrics={employeeChartMetrics} /><FinanceSeriesChart data={data.series} metric={metric} metrics={employeeChartMetrics} height={270} /></section>
      <div className="employee-finance-detail-grid">
        <section><h3>پرداخت‌ها</h3>{data.payments?.length ? data.payments.map((item) => <article key={item.id}><b>{toman(item.employee_amount)}</b><span>{item.customer} · {item.services?.join("، ")}</span><small>{financeDate(item.date)} · {paymentLabels[item.status] || item.status} · مبلغ کل پرداخت {toman(item.amount)}</small></article>) : <Empty />}</section>
        <section><h3>تراکنش‌ها</h3>{data.transactions?.length ? data.transactions.map((item) => <article key={item.id}><b>{transactionLabels[item.type] || item.type} · {toman(item.employee_amount)}</b><span>{item.customer} · {item.services?.join("، ")}</span><small>{financeDate(item.date)} · نوبت #{item.appointment}</small></article>) : <Empty />}</section>
        <section><h3>نوبت‌ها</h3>{data.appointments?.length ? data.appointments.map((item) => <article key={item.id}><b>#{item.id} · {item.customer}</b><span>{item.services?.join("، ")}</span><small>{item.date || "—"} · {labels[item.status] || item.status} · {appointmentPaymentLabels[item.payment_status] || item.payment_status}</small></article>) : <Empty />}</section>
        <section><h3>سرویس‌های انجام‌شده</h3>{data.services_performed?.length ? data.services_performed.map((item) => <article key={item.id}><b>{item.service} · {toman(item.amount)}</b><span>{item.customer} · کمیسیون {toman(item.commission)}</span><small>{item.date} · {labels[item.status] || item.status} · {appointmentPaymentLabels[item.payment_status] || item.payment_status}</small></article>) : <Empty />}</section>
      </div>
    </>}
  </section></div>;
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
      {preset === "custom" && <div className="finance-custom-range"><label>از<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>تا<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}
      <select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">همه کارکنان</option>{employees.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    {overview.error && <div className="finance-message error">دریافت آمار مالی انجام نشد.</div>}
    {message && <div className="finance-message">{message}</div>}
    <div className="finance-stat-grid">
      <Stat label="پرداخت‌های تأییدشده" value={toman(metrics.received || 0)} note="دریافتی ناخالص" accent />
      <Stat label="درآمد خالص" value={toman(metrics.net_revenue || 0)} note={`پس از ${toman(metrics.refunded || 0)} بازپرداخت`} />
      <Stat label="گزارش در انتظار" value={toman(metrics.pending_reports || 0)} note="نیازمند بررسی مدیریت" />
      <Stat label="مانده نوبت‌ها" value={toman(metrics.outstanding || 0)} note="پرداخت‌نشده در بازه" />
      <Stat label="ارزش خدمات تکمیل‌شده" value={toman(metrics.service_revenue || 0)} note="درآمد مشارکتی خدمات" />
      <Stat label="کمیسیون کارکنان" value={toman(metrics.commission_total || 0)} note="مجزا از درآمد سالن" />
    </div>
    <div className="finance-chart-grid">
      <section className="admin-panel finance-chart"><div className="panel-title"><div><span>روند زمانی</span><h2>{adminChartMetrics[chartMetric]}</h2></div></div><FinanceChartControls grouping={chartGrouping} onGrouping={setChartGrouping} metric={chartMetric} onMetric={setChartMetric} /><FinanceSeriesChart data={metrics.series} metric={chartMetric} /></section>
      <section className="admin-panel finance-chart service-performance"><div className="panel-title"><div><span>بر پایه پرداخت تأییدشده</span><h2>سهم سرویس‌های پردرآمد</h2></div></div>{metrics.services?.length ? <><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={metrics.services} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>{metrics.services.map((entry,index) => <Cell key={entry.id} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => toman(value)} /></PieChart></ResponsiveContainer><div className="service-performance-legend">{metrics.services.slice(0,5).map((item,index) => <div key={item.id}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{item.name}<small>{new Intl.NumberFormat("fa-IR").format(item.paid_services)} سرویس پرداخت‌شده</small></span><b>{new Intl.NumberFormat("fa-IR").format(item.share)}٪</b></div>)}</div></> : <Empty title="سرویس پرداخت‌شده‌ای نیست" />}</section>
    </div>
    <section className="admin-panel finance-employees"><div className="panel-title"><div><span>تفکیک عملکرد</span><h2>درآمد تأییدشده و کمیسیون کارکنان</h2></div></div><div className="finance-employee-grid">{metrics.employees?.map((item) => <button type="button" className="finance-employee-card" key={item.id} onClick={() => setSelectedEmployee(item)}>{item.profile_photo_url ? <img src={item.profile_photo_url} alt="" /> : <i>{item.name?.[0] || "م"}</i>}<span><b>{item.name}</b><small>{new Intl.NumberFormat("fa-IR").format(item.completed_services)} سرویس · {item.payments} پرداخت</small></span><strong>{toman(item.confirmed_revenue)}</strong><small>کمیسیون: {toman(item.commission)}</small></button>)}</div>{!metrics.employees?.length && <Empty />}</section>
    <section className="admin-panel finance-table-panel"><div className="panel-title"><div><span>پرداخت‌ها</span><h2>سوابق و گزارش‌های پرداخت</h2></div></div><div className="finance-table-filters"><input placeholder="جست‌وجوی مشتری، نوبت یا توضیح" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(paymentLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">همه روش‌ها</option>{Object.entries(methodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>{payments.loading ? <Skeleton /> : payments.data.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>تاریخ</th><th>مشتری / نوبت</th><th>گزارش‌دهنده</th><th>مبلغ</th><th>روش</th><th>وضعیت</th><th></th></tr></thead><tbody>{payments.data.map((item) => <tr key={item.id} className={item.status}><td>{financeDate(item.created_at)}</td><td><b>{item.customer_name || "مشتری"}</b><small>نوبت #{item.appointment}</small></td><td>{item.reporter_name || "مدیریت"}</td><td>{toman(item.amount)}</td><td>{methodLabels[item.payment_method]}</td><td><span className={`finance-badge ${item.status}`}>{paymentLabels[item.status]}</span></td><td><button className="admin-ghost" onClick={() => setSelected(item)}>جزئیات</button></td></tr>)}</tbody></table></div> : <Empty />}</section>
    <div className="admin-grid-two"><section className="admin-panel"><div className="panel-title"><div><span>دفتر تغییرناپذیر</span><h2>آخرین تراکنش‌ها</h2></div></div><div className="finance-ledger">{transactions.data.slice(0,8).map((item) => <div key={item.id}><span className={`finance-badge ${item.type}`}>{transactionLabels[item.type] || item.type}</span><b>{toman(item.amount)}</b><small>{item.customer_name || item.description || `نوبت #${item.appointment}`}</small></div>)}</div></section><section className="admin-panel"><div className="panel-title"><div><span>کارکنان</span><h2>آخرین کمیسیون‌ها</h2></div></div><div className="finance-ledger">{commissions.data.slice(0,8).map((item) => <div key={item.id}><span>{item.employee_name}</span><b>{toman(item.commission_amount)}</b><small>{item.service_name} · {item.status}</small></div>)}</div></section></div>
    {selected && <div className="drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="admin-drawer finance-detail" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelected(null)}>×</button><span className="admin-kicker">پرداخت #{selected.id}</span><h2>{toman(selected.amount)}</h2><div className="finance-detail-summary"><span className={`finance-badge ${selected.status}`}>{paymentLabels[selected.status]}</span><p>نوبت #{selected.appointment} · {selected.customer_name || "مشتری"}</p><p>روش: {methodLabels[selected.payment_method]} · گزارش‌دهنده: {selected.reporter_name || "مدیریت"}</p>{selected.reviewed_by_name && <p>بررسی‌کننده: {selected.reviewed_by_name}</p>}</div><section><h3>سرویس‌ها و متخصصان</h3>{selected.appointment_items?.map((item) => <div className="finance-detail-line" key={item.id}><b>{item.service}</b><span>{item.employee}</span></div>)}</section>{selected.notes && <section><h3>یادداشت</h3><p>{selected.notes}</p></section>}{selected.refunds?.length > 0 && <section><h3>بازپرداخت‌های ثبت‌شده</h3>{selected.refunds.map((item) => <div className="finance-detail-line" key={item.id}><b>{toman(item.amount)}</b><span>{item.reason || "بدون توضیح"}</span></div>)}</section>}{selected.status === "pending" && <div className="finance-review-actions"><button className="admin-success" disabled={busy} onClick={() => reviewPayment(selected,"confirm")}>تأیید گزارش</button><button className="admin-danger" disabled={busy} onClick={() => reviewPayment(selected,"reject")}>رد گزارش</button></div>}{["paid","refunded"].includes(selected.status) && selected.refundable_total > 0 && <form className="finance-refund-form" onSubmit={createRefund}><h3>ثبت بازپرداخت</h3><label>مبلغ<input required type="number" min="1" max={selected.refundable_total} value={refund.amount} onChange={(event) => setRefund({ ...refund, amount: event.target.value })} /></label><label>دلیل<textarea value={refund.reason} onChange={(event) => setRefund({ ...refund, reason: event.target.value })} /></label><button className="admin-danger" disabled={busy}>ثبت بازپرداخت</button></form>}</aside></div>}
    {manualOpen && <div className="modal-backdrop" onMouseDown={() => setManualOpen(false)}><form className="admin-modal" onSubmit={createPayment} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="drawer-close" onClick={() => setManualOpen(false)}>×</button><span className="admin-kicker">ثبت توسط مدیریت</span><h2>پرداخت دستی</h2><label>نوبت<select required value={manual.appointment} onChange={(event) => setManual({ ...manual, appointment: event.target.value })}><option value="">انتخاب نوبت</option>{appointments.data.filter((item) => item.remaining_total > 0 && item.status !== "cancelled").map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.customer_name} · مانده {toman(item.remaining_total)}</option>)}</select></label><label>مبلغ<input required min="1" type="number" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} /></label><label>روش<select value={manual.payment_method} onChange={(event) => setManual({ ...manual, payment_method: event.target.value })}>{Object.entries(methodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>یادداشت<textarea value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></label><button className="admin-primary" disabled={busy}>ثبت پرداخت</button></form></div>}
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
        element={<ServiceManagement />}
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
