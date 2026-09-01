import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { toJalaali } from "jalaali-js";
import { JalaliDatePicker } from "../components/DatePicker";
import { api, toman } from "../shared/api";

const today = new Date().toISOString().slice(0, 10);
const unwrap = (data) => data?.results || data || [];
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
  const appointments = useResource("admin/appointments/");
  const dailyRevenue = useResource("admin/revenue/?period=day");
  const weeklyRevenue = useResource("admin/revenue/?period=week");
  const monthlyRevenue = useResource("admin/revenue/?period=month");
  const services = useResource("services/");
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    api
      .get("admin/activity/")
      .then(({ data }) => setActivity(unwrap(data)))
      .catch(() => setActivity([]));
  }, []);
  const todays = appointments.data.filter(
    (item) =>
      item.items?.some((line) => line.date === today) || item.date === today,
  );
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
          label="درآمد امروز"
          value={toman(dailyRevenue.data.total)}
          accent
        />
        <Stat
          label="درآمد این هفته"
          value={toman(weeklyRevenue.data.total)}
          note="داده‌های ثبت‌شده"
        />
        <Stat label="درآمد این ماه" value={toman(monthlyRevenue.data.total)} />
        <Stat
          label="درخواست‌های در انتظار"
          value={
            appointments.data.filter((item) => item.status === "pending").length
          }
        />
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
              <h2>وضعیت پرداخت‌ها</h2>
            </div>
          </div>
          <div className="ring-stat">
            <div className="fake-ring">
              <b>{dailyRevenue.data.total ? "✓" : "۰"}</b>
              <small>پرداخت موفق</small>
            </div>
            <div className="legend">
              <span>
                <i className="dot green" />
                پرداخت‌شده
              </span>
              <span>
                <i className="dot yellow" />
                در انتظار
              </span>
              <span>
                <i className="dot red" />
                مانده
              </span>
            </div>
          </div>
          <div className="mini-summary">
            <span>
              نوبت‌های انجام‌شده{" "}
              <b>
                {
                  appointments.data.filter(
                    (item) => item.status === "completed",
                  ).length
                }
              </b>
            </span>
            <span>
              لغوشده{" "}
              <b>
                {
                  appointments.data.filter(
                    (item) => item.status === "cancelled",
                  ).length
                }
              </b>
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
          {services.loading ? (
            <Skeleton count={5} />
          ) : services.data.length ? (
            <div className="rank-list">
              {services.data.slice(0, 5).map((service, index) => (
                <div key={service.id}>
                  <b>۰{index + 1}</b>
                  <span>{service.persian_name || service.name}</span>
                  <em>
                    {
                      appointments.data.filter((item) =>
                        item.items?.some((line) => line.service === service.id),
                      ).length
                    }{" "}
                    رزرو
                  </em>
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
  return (
    <button className="appointment-row" onClick={onClick}>
      <span className="time">{line.start_time || "--:--"}</span>
      <span>
        <b>{item.customer_name || item.customer?.name || `رزرو #${item.id}`}</b>
        <small>
          {line.service_name || `نوبت ${item.items?.length || 1} خدمت`}
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
  const [view, setView] = useState("day");
  const [anchor, setAnchor] = useState(today);
  const [status, setStatus] = useState("all");
  const [employee, setEmployee] = useState("");
  const [service, setService] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");
  const range = dateRange(anchor, view);
  const query = new URLSearchParams({
    start_date: range.start,
    end_date: range.end,
    ...(status !== "all" && { status }),
    ...(employee && { employee }),
    ...(service && { service }),
  });
  const resource = useResource(`admin/appointments/?${query}`);
  const moveRange = (direction) =>
    setAnchor(
      shiftDate(
        anchor,
        view === "month"
          ? direction * 30
          : view === "week"
            ? direction * 7
            : direction,
      ),
    );
  return (
    <div className="admin-page">
      <Header
        eyebrow="مدیریت نوبت‌ها"
        title="نوبت‌ها"
        action="افزودن نوبت"
        onAction={() => setCreateOpen(true)}
      />
      <div className="toolbar">
        <div className="segmented">
          {[
            ["day", "روز"],
            ["week", "هفته"],
            ["month", "ماه"],
          ].map(([value, label]) => (
            <button
              className={view === value ? "selected" : ""}
              key={value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
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
            aria-label="فیلتر خدمت"
            value={service}
            onChange={(event) => setService(event.target.value)}
          >
            <option value="">همه خدمات</option>
            {services.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.persian_name || item.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <AppointmentCalendar
        anchor={anchor}
        onSelect={(date) => {
          setAnchor(date);
          setView("day");
        }}
      />
      <section className="admin-panel calendar-panel">
        <div className="calendar-strip">
          <button aria-label="بازه قبل" onClick={() => moveRange(-1)}>
            ‹
          </button>
          <strong>
            {new Intl.DateTimeFormat("fa-IR", {
              weekday: view === "day" ? "long" : undefined,
              month: "long",
              year: "numeric",
              day: view === "day" ? "numeric" : undefined,
            }).format(new Date(`${anchor}T00:00:00`))}
          </strong>
          <button aria-label="بازه بعد" onClick={() => moveRange(1)}>
            ›
          </button>
          <span>
            {employees.data.length} متخصص فعال · {services.data.length} خدمت
          </span>
        </div>
        {resource.loading ? (
          <Skeleton count={7} />
        ) : resource.data.length ? (
          <div className="appointment-table">
            {resource.data.map((item) => (
              <AppointmentRow
                item={item}
                key={item.id}
                onClick={() => setSelected(item)}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="نوبتی با این فیلتر پیدا نشد"
            text="فیلترها را تغییر دهید یا یک رزرو تازه بسازید."
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
function AppointmentCalendar({ anchor, onSelect }) {
  const value = new Date(`${anchor}T00:00:00`);
  const monthStart = new Date(value.getFullYear(), value.getMonth(), 1);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  const jalali = toJalaali(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
  );
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
      </div>
      <div className="appointment-calendar-weekdays">
        {["ی", "د", "س", "چ", "پ", "ج", "ش"].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div className="appointment-calendar-days">
        {Array.from({ length: 42 }, (_, index) => {
          const day = new Date(start);
          day.setDate(start.getDate() + index);
          const iso = day.toISOString().slice(0, 10);
          const local = toJalaali(
            day.getFullYear(),
            day.getMonth() + 1,
            day.getDate(),
          );
          return (
            <button
              type="button"
              key={iso}
              className={
                iso === anchor
                  ? "selected"
                  : day.getMonth() !== value.getMonth()
                    ? "muted"
                    : ""
              }
              onClick={() => onSelect(iso)}
            >
              {new Intl.NumberFormat("fa-IR").format(local.jd)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
function shiftDate(value, days) {
  const next = new Date(`${value}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}
function dateRange(anchor, view) {
  const value = new Date(`${anchor}T00:00:00`);
  if (view === "day") return { start: anchor, end: anchor };
  if (view === "week") {
    const start = shiftDate(anchor, -value.getDay());
    return { start, end: shiftDate(start, 6) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  return {
    start,
    end: shiftDate(
      `${Number(anchor.slice(0, 4))}-${String(Number(anchor.slice(5, 7)) + 1).padStart(2, "0")}-01`,
      -1,
    ),
  };
}
function AdminAppointmentForm({ close, onCreated }) {
  const customers = useResource("admin/customer-options/");
  const services = useResource("services/");
  const [form, setForm] = useState({
    date: today,
    status: "pending",
    payment_status: "",
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
        ...(form.payment_status && { payment_status: form.payment_status }),
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
        <label>
          وضعیت پرداخت
          <select
            value={form.payment_status}
            onChange={(event) => update("payment_status", event.target.value)}
          >
            <option value="">بدون ثبت پرداخت</option>
            <option value="pending">در انتظار</option>
            <option value="paid">پرداخت شده</option>
            <option value="failed">ناموفق</option>
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
  const changeStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`admin/appointments/${item.id}/`, { status });
      onSaved();
    } finally {
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
  const submit = async (event) => {
    event.preventDefault();
    let body = form;
    if (uploads) {
      body = new FormData();
      Object.entries(form)
        .filter(([, value]) => value !== "" && value !== undefined)
        .forEach(([name, value]) => body.append(name, value));
    }
    try {
      await api.post(endpoint, body);
      setOpen(false);
      setForm({});
      resource.reload();
      setToast("با موفقیت ذخیره شد");
    } catch {
      setToast("ذخیره اطلاعات انجام نشد");
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
            <button className="admin-primary" type="submit">
              ذخیره تغییرات
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
  return (
    <>
      <CrudPage
        type="تراکنش"
        endpoint="admin/transactions/"
        title="مالی و پرداخت‌ها"
        eyebrow="حسابداری"
        fields={[
          {
            name: "type",
            label: "نوع تراکنش",
            type: "select",
            optionsEndpoint: "admin/transaction-types/",
          },
          { name: "amount", label: "مبلغ", type: "number" },
          {
            name: "appointment",
            label: "نوبت",
            type: "select",
            optionsEndpoint: "admin/appointments/",
            optionLabel: appointmentOptionLabel,
          },
          { name: "description", label: "شرح" },
        ]}
      />
      <CrudPage
        type="پرداخت"
        endpoint="admin/payments/"
        title="پرداخت‌ها"
        eyebrow="حسابداری"
        fields={[
          {
            name: "appointment",
            label: "نوبت",
            type: "select",
            optionsEndpoint: "admin/appointments/",
            optionLabel: appointmentOptionLabel,
          },
          { name: "amount", label: "مبلغ", type: "number" },
          { name: "provider_reference", label: "شناسه پرداخت" },
        ]}
      />
    </>
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
        ["category", "دسته‌بندی"],
        ["image", "تصویر", "file"],
        ["description", "توضیحات"],
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
