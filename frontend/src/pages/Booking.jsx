import TelegramConnect from "../components/TelegramConnect";
import { formatServicePrice, bookingPriceSummary } from "../shared/pricing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DateModal } from "../components/DatePicker";
import { api } from "../shared/api";
import { useServices } from "../shared/hooks";
import { SEO } from "../components/SEO";
const steps = ["سرویس‌ها", "متخصص", "زمان", "اطلاعات", "تأیید"];
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(
    new Date(),
  );
const unwrap = (data) => data?.results || data || [];
function WizardHeader({ step }) {
  return (
    <div className="wizard-header">
      <div className="wizard-progress-copy">
        <span>رزرو آنلاین</span>
        <b>
          مرحله {new Intl.NumberFormat("fa-IR").format(step + 1)} از{" "}
          {new Intl.NumberFormat("fa-IR").format(steps.length)}
        </b>
      </div>
      <div className="wizard-steps">
        {steps.map((label, index) => (
          <div
            className={`${index <= step ? "active" : ""} ${index === step ? "current" : ""}`}
            key={label}
            aria-current={index === step ? "step" : undefined}
          >
            <b>{new Intl.NumberFormat("fa-IR").format(index + 1)}</b>
            <small>{label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function Back({ onClick }) {
  return (
    <button type="button" className="wizard-back" onClick={onClick}>
      → بازگشت
    </button>
  );
}
function Next({ children = "ادامه", disabled = false, onClick }) {
  return (
    <button
      className="button wizard-next"
      disabled={disabled}
      onClick={onClick}
    >
      {children} <span>←</span>
    </button>
  );
}
function EmptyLine({ text }) {
  return <p className="wizard-empty">{text}</p>;
}

export default function Booking() {
  const { services, state: servicesState } = useServices();
  const params = new URLSearchParams(useLocation().search);
  const initialServices = params.get("services")?.split(",").filter(Boolean) || (params.get("service") ? [params.get("service")] : []);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialServices.length ? 1 : 0);
  const [selected, setSelected] = useState(initialServices);
  const [employees, setEmployees] = useState({});
  const [employeeIds, setEmployeeIds] = useState({});
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [contact, setContact] = useState({
    name: "",
    phone: "",
    notes: "",
    account: false,
  });
  const [hold, setHold] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const chosenServices = useMemo(
    () =>
      selected
        .map((id) =>
          services.find((service) => String(service.id) === String(id)),
        )
        .filter(Boolean),
    [selected, services],
  );
  const totalDuration = chosenServices.reduce(
    (sum, service) => sum + Number(service.duration || 0),
    0,
  );
  const selectedEmployees = useMemo(
    () =>
      Object.fromEntries(
        selected.map((serviceId) => {
          const employee = (employees[serviceId] || []).find(
            (item) => String(item.id) === String(employeeIds[serviceId]),
          );
          return [serviceId, employee];
        }),
      ),
    [selected, employees, employeeIds],
  );
  const bookingItems = useMemo(() => {
    if (!date || !time) return [];
    let current = new Date(`2000-01-01T${time}:00`);
    return chosenServices.map((service) => {
      const start_time = current.toTimeString().slice(0, 5);
      current = new Date(
        current.getTime() + Number(service.duration || 0) * 60000,
      );
      return {
        service: service.id,
        employee: employeeIds[service.id],
        date,
        start_time,
        end_time: current.toTimeString().slice(0, 5),
      };
    });
  }, [chosenServices, employeeIds, date, time]);
  useEffect(() => {
    selected.forEach((serviceId) => {
      if (!employees[serviceId])
        api
          .get(`employees/?service=${serviceId}`)
          .then(({ data }) =>
            setEmployees((current) => ({
              ...current,
              [serviceId]: unwrap(data),
            })),
          )
          .catch(() =>
            setEmployees((current) => ({ ...current, [serviceId]: [] })),
          );
    });
  }, [selected, employees]);
  useEffect(() => {
    if (
      !date ||
      chosenServices.length !== selected.length ||
      Object.keys(employeeIds).length !== selected.length
    )
      return;
    const items = chosenServices.map((service) => ({
      service: service.id,
      employee: employeeIds[service.id],
    }));
    api
      .get(
        `availability/?date=${date}&items=${encodeURIComponent(JSON.stringify(items))}`,
      )
      .then(({ data }) => setSlots(data.slots || []))
      .catch(() => setSlots([]));
  }, [date, selected, employeeIds, chosenServices]);
  useEffect(
    () => () => {
      if (hold) api.delete(`booking-holds/${hold.token}/`).catch(() => {});
    },
    [hold],
  );
  const toggleService = (id) =>
    setSelected((current) =>
      current.includes(String(id))
        ? current.filter((value) => value !== String(id))
        : [...current, String(id)],
    );
  const reserveHold = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("booking-holds/", {
        items: bookingItems,
      });
      setHold(data);
      setStep(3);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "این زمان دیگر در دسترس نیست.",
      );
    } finally {
      setLoading(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("appointments/", {
        tg_campaign: new URLSearchParams(window.location.search).get("tg_campaign"),
        customer_name: contact.name,
        customer_phone: contact.phone,
        notes: contact.notes,
        create_account: contact.account,
        account_password: contact.password,
        hold_token: hold?.token,
        items: bookingItems,
      });
      setConfirmation(data);
      setHold(null);
      setStep(4);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "ثبت رزرو انجام نشد. زمان دیگری را امتحان کنید.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };
  if (confirmation)
    return <><SEO title={confirmation.status === "confirmed" ? "نوبت تأیید شد | بهارناژ" : "درخواست نوبت ثبت شد | بهارناژ"} description="اطلاعات درخواست نوبت شما در بهارناژ." canonicalPath="/book" noindex /><Confirmation appointment={confirmation} navigate={navigate} /></>;
  return (
    <>
    <SEO title="رزرو آنلاین سالن بهارناژ در رشت" description="سرویس، متخصص و زمان مناسب خود را در سالن زیبایی بهارناژ رشت به‌صورت آنلاین انتخاب و رزرو کنید." canonicalPath="/book" />
    <section className="booking-wizard container">
      <WizardHeader step={step} />
      <div className="wizard-layout">
        <div>
          <div className="wizard-intro">
            <p className="eyebrow">وقت تو، همین حالا</p>
            <h1>
              {step === 0
                ? "سرویس‌ت را انتخاب کن."
                : step === 1
                  ? "متخصصت را انتخاب کن."
                  : step === 2
                    ? "زمان مناسب را پیدا کن."
                    : step === 3
                      ? "اطلاعات تماس"
                      : "تأیید نهایی"}
            </h1>
            <p>
              می‌توانید چند خدمت را در یک نوبت انتخاب کنید؛ ساعت‌ها بر اساس
              برنامه واقعی سالن نمایش داده می‌شوند.
            </p>
          </div>
          {error && <p role="alert" className="error wizard-error">{error}</p>}
          {step === 0 && (
            <ServiceStep
              services={services}
              servicesState={servicesState}
              selected={selected}
              toggle={toggleService}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <EmployeeStep
              selected={selected}
              services={chosenServices}
              employees={employees}
              employeeIds={employeeIds}
              setEmployeeIds={setEmployeeIds}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <TimeStep
              date={date}
              setDate={(value) => {
                setDate(value);
                setTime("");
                setSlots([]);
              }}
              dateOpen={dateOpen}
              setDateOpen={setDateOpen}
              slots={slots}
              time={time}
              setTime={setTime}
              onBack={() => setStep(1)}
              onNext={reserveHold}
              loading={loading}
            />
          )}{" "}
          {step === 3 && (
            <ContactStep
              contact={contact}
              setContact={setContact}
              chosenServices={chosenServices}
              selectedEmployees={selectedEmployees}
              date={date}
              time={time}
              hold={hold}
              onBack={() => {
                setHold(null);
                setStep(2);
              }}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <ReviewStep
              contact={contact}
              chosenServices={chosenServices}
              selectedEmployees={selectedEmployees}
              date={date}
              time={time}
              onBack={() => setStep(3)}
              onSubmit={submit}
              loading={loading}
            />
          )}
        </div>
        <aside className="wizard-aside">
          <span>خلاصه انتخاب</span>
          <strong>
            {new Intl.NumberFormat("fa-IR").format(chosenServices.length)} سرویس
          </strong>
          <p>{new Intl.NumberFormat("fa-IR").format(totalDuration)} دقیقه</p>
          <b>{bookingPriceSummary(chosenServices)}</b>
          {chosenServices.length ? (
            <ul>
              {chosenServices.map((service) => (
                <li key={service.id}>{service.persian_name || service.name}</li>
              ))}
            </ul>
          ) : (
            <small>با انتخاب سرویس‌ها، خلاصه اینجا نمایش داده می‌شود.</small>
          )}
        </aside>
      </div>
    </section>
    </>
  );
}
function ServiceStep({ services, servicesState, selected, toggle, onNext }) {
  const groups = services.reduce((result, service) => {
    const key =
      service.category_name || service.category?.name || "سرویس‌های بهارناژ";
    (result[key] ||= []).push(service);
    return result;
  }, {});
  const selectedServices = services.filter((service) =>
    selected.includes(String(service.id)),
  );
  return (
    <div className="wizard-panel">
      {selectedServices.length > 0 && (
        <div className="selected-tray" aria-label="سرویس‌های انتخاب‌شده">
          {selectedServices.map((service) => (
            <button
              type="button"
              key={service.id}
              onClick={() => toggle(service.id)}
            >
              {service.persian_name || service.name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="category-groups">
        {Object.entries(groups).map(([category, items]) => (
          <section key={category}>
            <h2>{category}</h2>
            <div className="service-choice-grid">
              {items.map((service) => (
                <button
                  type="button"
                  aria-pressed={selected.includes(String(service.id))}
                  className={
                    selected.includes(String(service.id)) ? "selected" : ""
                  }
                  onClick={() => toggle(service.id)}
                  key={service.id}
                >
                  <span>
                    {selected.includes(String(service.id)) ? "✓" : "＋"}
                  </span>
                  <strong>{service.persian_name || service.name}</strong>
                  <small>
                    {new Intl.NumberFormat("fa-IR").format(service.duration)}{" "}
                    دقیقه · {formatServicePrice(service)}
                  </small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {servicesState === "loading" && (
        <EmptyLine text="در حال دریافت سرویس‌ها…" />
      )}
      {servicesState === "error" && (
        <EmptyLine text="دریافت سرویس‌ها ممکن نیست. لطفاً دوباره تلاش کنید." />
      )}
      {servicesState === "ready" && !services.length && (
        <EmptyLine text="سرویسی برای رزرو وجود ندارد." />
      )}
      <div className="wizard-footer">
        <span>
          {new Intl.NumberFormat("fa-IR").format(selected.length)} سرویس انتخاب
          شده
        </span>
        <Next disabled={!selected.length} onClick={onNext}>
          انتخاب متخصص
        </Next>
      </div>
    </div>
  );
}
function EmployeeStep({
  selected,
  services,
  employees,
  employeeIds,
  setEmployeeIds,
  onBack,
  onNext,
}) {
  const complete = selected.every((id) => employeeIds[id]);
  return (
    <div className="wizard-panel">
      <div className="employee-choices">
        {services.map((service) => (
          <section key={service.id}>
            <h2>{service.persian_name || service.name}</h2>
            <div className="employee-choice-grid">
              {(employees[service.id] || []).map((employee) => (
                <button
                  type="button"
                  aria-pressed={
                    String(employeeIds[service.id]) === String(employee.id)
                  }
                  className={
                    String(employeeIds[service.id]) === String(employee.id)
                      ? "selected"
                      : ""
                  }
                  key={employee.id}
                  onClick={() =>
                    setEmployeeIds((current) => ({
                      ...current,
                      [service.id]: employee.id,
                    }))
                  }
                >
                  <div className="employee-photo">
                    {employee.profile_photo_url ? (
                      <img src={employee.profile_photo_url} alt={`تصویر ${employee.name || "متخصص بهارناژ"}`} loading="lazy" />
                    ) : (
                      (employee.name || "م")[0]
                    )}
                  </div>
                  <strong>{employee.name || "متخصص بهارناژ"}</strong>
                  {employee.specialty && <small>{employee.specialty}</small>}
                  {employee.bio && <p>{employee.bio}</p>}
                </button>
              ))}
            </div>
            {!employees[service.id]?.length && (
              <EmptyLine text="متخصص فعالی برای این سرویس پیدا نشد." />
            )}
          </section>
        ))}
      </div>
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={!complete} onClick={onNext}>
          انتخاب تاریخ و ساعت
        </Next>
      </div>
    </div>
  );
}
function TimeStep({
  date,
  setDate,
  dateOpen,
  setDateOpen,
  slots,
  time,
  setTime,
  onBack,
  onNext,
  loading,
}) {
  return (
    <div className="wizard-panel">
      <label className="wizard-label">
        تاریخ نوبت
        <button
          type="button"
          className="date-trigger"
          onClick={() => setDateOpen(true)}
        >
          {date
            ? new Intl.DateTimeFormat("fa-IR", {
                timeZone: "Asia/Tehran",
              }).format(new Date(`${date}T00:00:00Z`))
            : "انتخاب تاریخ"}
        </button>
      </label>
      {dateOpen && (
        <DateModal
          value={date || today()}
          onChange={setDate}
          onClose={() => setDateOpen(false)}
        />
      )}
      {date && (
        <>
          <div className="slot-heading">
            <h2>ساعت‌های آزاد</h2>
            <span>برنامه تهران</span>
          </div>
          {slots.length ? (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  type="button"
                  aria-pressed={time === slot}
                  className={time === slot ? "selected" : ""}
                  onClick={() => setTime(slot)}
                  key={slot}
                >
                  {slot}
                </button>
              ))}
            </div>
          ) : (
            <EmptyLine text="در این تاریخ ساعتی پیدا نشد. تاریخ دیگری را امتحان کنید." />
          )}
        </>
      )}
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={!date || !time || loading} onClick={onNext}>
          {loading ? "در حال بررسی..." : "ادامه"}
        </Next>
      </div>
    </div>
  );
}
function BookingSummary({
  chosenServices,
  selectedEmployees,
  date,
  time,
  contact,
}) {
  return (
    <div className="booking-summary">
      <div>
        <small>سرویس‌ها و متخصصان</small>
        {chosenServices.map((service) => (
          <span key={service.id}>
            <b>{service.persian_name || service.name}</b>
            {selectedEmployees[service.id]?.name && (
              <i>{selectedEmployees[service.id].name}</i>
            )}
          </span>
        ))}
      </div>
      {contact && (
        <div>
          <small>اطلاعات تماس</small>
          <span>
            <b>{contact.name}</b>
            <i>{contact.phone}</i>
          </span>
        </div>
      )}
      <div>
        <small>زمان</small>
        <span>
          <b>{date}</b>
          <i>{time}</i>
        </span>
      </div>
      <strong>{bookingPriceSummary(chosenServices)}</strong>
    </div>
  );
}
function ContactStep({
  contact,
  setContact,
  chosenServices,
  selectedEmployees,
  date,
  time,
  hold,
  onBack,
  onNext,
}) {
  return (
    <form
      className="wizard-panel contact-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <div className="hold-notice">
        این زمان تا ۵ دقیقه برای شما نگه داشته شده است.
      </div>
      <BookingSummary
        chosenServices={chosenServices}
        selectedEmployees={selectedEmployees}
        date={date}
        time={time}
      />
      <label>
        نام و نام خانوادگی
        <input
          required
          value={contact.name}
          onChange={(event) =>
            setContact({ ...contact, name: event.target.value })
          }
          autoComplete="name"
        />
      </label>
      <label>
        شماره موبایل
        <input
          required
          type="tel"
          pattern="(?:\+98|0098|0)9[0-9]{9}"
          value={contact.phone}
          onChange={(event) =>
            setContact({ ...contact, phone: event.target.value })
          }
          placeholder="۰۹۱۲…"
          autoComplete="tel"
          inputMode="tel"
        />
      </label>
      <label>
        یادداشت یا ترجیح خاص <span className="optional">اختیاری</span>
        <textarea
          value={contact.notes}
          onChange={(event) =>
            setContact({ ...contact, notes: event.target.value })
          }
        />
      </label>
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={!hold}>بررسی اطلاعات</Next>
      </div>
    </form>
  );
}
function ReviewStep({
  contact,
  chosenServices,
  selectedEmployees,
  date,
  time,
  onBack,
  onSubmit,
  loading,
}) {
  return (
    <form className="wizard-panel contact-panel" onSubmit={onSubmit}>
      <BookingSummary
        chosenServices={chosenServices}
        selectedEmployees={selectedEmployees}
        date={date}
        time={time}
        contact={contact}
      />
      <p className="wizard-empty">
        اطلاعات رزرو را بررسی کنید. با ثبت نهایی، درخواست برای سالن ارسال می‌شود.
      </p>
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={loading}>
          {loading ? "در حال ثبت…" : "تأیید و ثبت نهایی رزرو"}
        </Next>
      </div>
    </form>
  );
}
function Confirmation({ appointment, navigate }) {
  return (
    <section className="booking-confirmation container">
      <p className="eyebrow">درخواست شما ثبت شد</p>
      <h1>{appointment.status === "confirmed" ? "نوبت شما تأیید شد." : "درخواست نوبت دریافت شد."}</h1>
      {appointment.status !== "confirmed" && <p>ثبت درخواست به معنی تأیید نهایی نوبت نیست. برای هماهنگی، با سالن در تماس باشید.</p>}
      <p>
        کد پیگیری شما: <strong>{appointment.confirmation_code}</strong>
      </p>
      <div className="confirmation-card">
        <h2>جزئیات نوبت</h2>
        {appointment.items?.map((item) => (
          <div key={item.id}>
            <b>{item.service_name || "سرویس بهارناژ"}</b>
            <span>
              {item.date} · {item.start_time} تا {item.end_time}
            </span>
          </div>
        ))}
      </div>
      <TelegramConnect receipt={appointment.telegram_receipt} compact />
      <button className="button" onClick={() => navigate("/")}>
        بازگشت به خانه <span>←</span>
      </button>
    </section>
  );
}
