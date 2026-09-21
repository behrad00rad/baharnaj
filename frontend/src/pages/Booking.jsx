import TelegramConnect from "../components/TelegramConnect";
import { formatServicePrice, bookingPriceSummary } from "../shared/pricing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DateModal } from "../components/DatePicker";
import { api, applyRefreshSession } from "../shared/api";
import { useAuth } from "../shared/auth";
import { useServices } from "../shared/hooks";
import { SEO } from "../components/SEO";
import PasswordInput from "../components/PasswordInput";
import { formatJalaliDate } from "../shared/date";
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
  const { role } = useAuth();
  const { services, state: servicesState } = useServices();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const repeatedBooking = location.state?.bookAgain?.services || [];
  const initialServices = repeatedBooking.length
    ? repeatedBooking.map((item) => String(item.id))
    : params.get("services")?.split(",").filter(Boolean) || (params.get("service") ? [params.get("service")] : []);
  const navigate = useNavigate();
  const [step, setStep] = useState(initialServices.length ? 1 : 0);
  const [selected, setSelected] = useState(initialServices);
  const [employees, setEmployees] = useState({});
  const [employeeStates, setEmployeeStates] = useState({});
  const [employeeIds, setEmployeeIds] = useState(() => Object.fromEntries(
    repeatedBooking.filter((item) => item.preferred_employee).map((item) => [String(item.id), item.preferred_employee]),
  ));
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [availabilityState, setAvailabilityState] = useState(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [contact, setContact] = useState({
    name: "",
    phone: "",
    notes: "",
    account: false,
    email: "",
    password: "",
    passwordConfirm: "",
    acceptTerms: false,
  });
  const [hold, setHold] = useState(null);
  const [holdRemaining, setHoldRemaining] = useState(0);
  const [holdExpired, setHoldExpired] = useState(false);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
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
  const availabilityItems = useMemo(() => chosenServices.map((service) => ({
    service: service.id,
    employee: employeeIds[service.id],
  })).filter((item) => item.employee), [chosenServices, employeeIds]);
  useEffect(() => {
    if (role !== "customer") return;
    api.get("customer/profile/").then(({ data }) => setContact((current) => ({ ...current, name: data.display_name || "", phone: data.phone || "", account: false }))).catch(() => {});
  }, [role]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    selected.forEach((serviceId) => {
      if (!employeeStates[serviceId]) {
        setEmployeeStates((current) => ({ ...current, [serviceId]: "loading" }));
        api
          .get(`employees/?service=${serviceId}`)
          .then(({ data }) => {
            setEmployees((current) => ({
              ...current,
              [serviceId]: unwrap(data),
            }));
            setEmployeeStates((current) => ({ ...current, [serviceId]: "ready" }));
          })
          .catch(() => {
            setEmployees((current) => ({ ...current, [serviceId]: [] }));
            setEmployeeStates((current) => ({ ...current, [serviceId]: "error" }));
          });
      }
    });
  }, [selected, employeeStates]);
  useEffect(() => {
    if (
      !date ||
      chosenServices.length !== selected.length ||
      Object.keys(employeeIds).length !== selected.length
    )
      return;
    api
      .get(
        `availability/?date=${date}&items=${encodeURIComponent(JSON.stringify(availabilityItems))}`,
      )
      .then(({ data }) => {
        setSlots(data.slots || []);
        setAvailabilityState(data);
      })
      .catch(() => {
        setSlots([]);
        setAvailabilityState(null);
      });
  }, [date, selected, employeeIds, chosenServices, availabilityItems, availabilityRefresh]);
  useEffect(() => {
    if (!hold?.expires_at) return undefined;
    const update = () => {
      const expires = new Date(hold.expires_at).getTime();
      const remaining = Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - Date.now()) / 1000)) : 300;
      setHoldRemaining(remaining);
      if (remaining === 0 && Number.isFinite(expires)) setHoldExpired(true);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);
  useEffect(
    () => () => {
      if (hold) api.delete(`booking-holds/${hold.token}/`).catch(() => {});
    },
    [hold],
  );
  const toggleService = (id) => {
    const key = String(id);
    setSelected((current) => {
      if (!current.includes(key)) return [...current, key];
      setEmployeeIds((assigned) => {
        const next = { ...assigned };
        delete next[key];
        return next;
      });
      return current.filter((value) => value !== key);
    });
  };
  const reserveHold = async () => {
    setError("");
    if (!online) {
      setError("اتصال اینترنت برقرار نیست. پس از اتصال دوباره تلاش کنید.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("booking-holds/", {
        items: bookingItems,
      });
      setHold(data);
      setHoldExpired(false);
      setStep(3);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "این زمان دیگر در دسترس نیست.",
      );
    } finally {
      setLoading(false);
    }
  };
  const releaseHoldAndGo = (targetStep) => {
    if (hold) api.delete(`booking-holds/${hold.token}/`).catch(() => {});
    setHold(null); setHoldExpired(false); setStep(targetStep);
  };
  const recheckTime = () => {
    releaseHoldAndGo(2);
    setTime("");
    setAvailabilityRefresh((value) => value + 1);
  };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setLoading(true);
    try {
      if (!online) throw new Error("offline");
      const accountData = contact.account ? {
        create_account: true,
        account_password: contact.password,
        account_password_confirm: contact.passwordConfirm,
        account_email: contact.email,
        account_accept_terms: contact.acceptTerms,
      } : {};
      const { data } = await api.post("appointments/", {
        tg_campaign: new URLSearchParams(window.location.search).get("tg_campaign"),
        customer_name: contact.name,
        customer_phone: contact.phone,
        notes: contact.notes,
        ...accountData,
        hold_token: hold?.token,
        items: bookingItems,
      });
      setConfirmation(data);
      if (data.account_created && data.access) applyRefreshSession(data);
      setHold(null);
      setStep(4);
    } catch (requestError) {
      const responseData = requestError.response?.data;
      const fieldError = responseData && Object.values(responseData).flat(Infinity).find((value) => typeof value === "string");
      setError(
        (requestError.message === "offline" ? "اتصال اینترنت برقرار نیست. اطلاعات شما حفظ شده؛ پس از اتصال دوباره ثبت کنید." : responseData?.detail || fieldError) ||
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
      {!online && <div className="booking-offline" role="status">اینترنت قطع است؛ انتخاب‌های شما حفظ می‌شود اما ثبت نهایی تا اتصال دوباره ممکن نیست.</div>}
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
              employeeStates={employeeStates}
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
                setAvailabilityState(null);
              }}
              dateOpen={dateOpen}
              setDateOpen={setDateOpen}
              slots={slots}
              availabilityState={availabilityState}
              availabilityItems={availabilityItems}
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
              holdRemaining={holdRemaining}
              holdExpired={holdExpired}
              onRecheck={recheckTime}
              signedIn={role === "customer"}
              onBack={() => {
                releaseHoldAndGo(2);
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
              online={online}
              holdRemaining={holdRemaining}
              holdExpired={holdExpired}
              onRecheck={recheckTime}
              onEdit={(target) => target === 3 ? setStep(3) : releaseHoldAndGo(target)}
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
  employeeStates,
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
            {employeeStates[service.id] === "loading" && <EmptyLine text="در حال دریافت متخصص‌ها…" />}
            {employeeStates[service.id] === "error" && <EmptyLine text="دریافت متخصص‌ها انجام نشد. به مرحله قبل برگردید و دوباره تلاش کنید." />}
            {employeeStates[service.id] === "ready" && !employees[service.id]?.length && (
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
  availabilityState,
  availabilityItems,
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
          {formatJalaliDate(date, "انتخاب تاریخ")}
        </button>
      </label>
      {dateOpen && (
        <DateModal
          value={date || today()}
          onChange={setDate}
          onClose={() => setDateOpen(false)}
          availabilityItems={availabilityItems}
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
            <EmptyLine text={availabilityState?.status === "holiday" ? `سالن در این روز تعطیل است.${availabilityState.reason ? ` ${availabilityState.reason}` : ""}` : availabilityState?.status === "full" ? "تمام وقت‌های این روز پر شده است. تاریخ دیگری را انتخاب کنید." : availabilityState?.status === "unavailable" ? "متخصص انتخاب‌شده در این روز برنامه کاری ندارد." : "در این تاریخ ساعتی پیدا نشد. تاریخ دیگری را امتحان کنید."} />
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
          <b>{formatJalaliDate(date, "تاریخ نامشخص")}</b>
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
  holdRemaining,
  holdExpired,
  onRecheck,
  signedIn,
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
      <div className={`hold-notice ${holdExpired ? "expired" : ""}`}>
        {holdExpired ? <><b>زمان نگهداری این نوبت تمام شد.</b><button type="button" onClick={onRecheck}>بررسی دوباره ساعت‌ها</button></> : <>این زمان برای شما نگه داشته شده است: <b dir="ltr">{new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(Math.floor(holdRemaining / 60))}:{new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(holdRemaining % 60)}</b></>}
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
          disabled={signedIn}
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
          disabled={signedIn}
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
      {!signedIn && <div className="account-offer">
        <label className="check-label"><input type="checkbox" checked={contact.account} onChange={(event) => setContact({ ...contact, account: event.target.checked })} /> ساخت حساب مشتری همراه این رزرو</label>
        {contact.account && <div className="account-fields">
          <p>بعد از ثبت، مستقیماً وارد حساب می‌شوید و این نوبت را در پنل خود می‌بینید.</p>
          <label>ایمیل بازیابی<input required type="email" autoComplete="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label>
          <label>رمز عبور<PasswordInput required minLength="8" autoComplete="new-password" value={contact.password} onChange={(event) => setContact({ ...contact, password: event.target.value })} /></label>
          <label>تکرار رمز عبور<PasswordInput visibilityLabel="تکرار رمز عبور" required minLength="8" autoComplete="new-password" value={contact.passwordConfirm} onChange={(event) => setContact({ ...contact, passwordConfirm: event.target.value })} /></label>
          <label className="check-label"><input required type="checkbox" checked={contact.acceptTerms} onChange={(event) => setContact({ ...contact, acceptTerms: event.target.checked })} /> <span>قوانین استفاده و حریم خصوصی را می‌پذیرم.</span></label>
        </div>}
      </div>}
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={!hold || holdExpired}>بررسی اطلاعات</Next>
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
  online,
  holdRemaining,
  holdExpired,
  onRecheck,
  onEdit,
}) {
  return (
    <form className="wizard-panel contact-panel" onSubmit={onSubmit}>
      <div className={`hold-notice ${holdExpired ? "expired" : ""}`}>{holdExpired ? <><b>زمان نگهداری این نوبت تمام شد.</b><button type="button" onClick={onRecheck}>بررسی دوباره ساعت‌ها</button></> : <>زمان باقی‌مانده برای ثبت: <b dir="ltr">{new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(Math.floor(holdRemaining / 60))}:{new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(holdRemaining % 60)}</b></>}</div>
      <BookingSummary
        chosenServices={chosenServices}
        selectedEmployees={selectedEmployees}
        date={date}
        time={time}
        contact={contact}
      />
      <div className="review-edit-links"><button type="button" onClick={() => onEdit(0)}>ویرایش سرویس</button><button type="button" onClick={() => onEdit(1)}>ویرایش متخصص</button><button type="button" onClick={() => onEdit(2)}>ویرایش زمان</button><button type="button" onClick={() => onEdit(3)}>ویرایش اطلاعات تماس</button></div>
      <p className="wizard-empty">
        اطلاعات رزرو را بررسی کنید. با ثبت نهایی، درخواست برای سالن ارسال می‌شود.
      </p>
      <div className="wizard-footer">
        <Back onClick={onBack} />
        <Next disabled={loading || !online || holdExpired}>
          {loading ? "در حال ثبت…" : "تأیید و ثبت نهایی رزرو"}
        </Next>
      </div>
    </form>
  );
}
function Confirmation({ appointment, navigate }) {
  const copyCode = () => navigator.clipboard?.writeText(appointment.confirmation_code);
  const share = () => navigator.share?.({ title: "نوبت بهارناژ", text: `کد پیگیری نوبت: ${appointment.confirmation_code}` });
  const duration = appointment.items?.reduce((sum, item) => sum + Number(item.duration_snapshot || 0), 0) || 0;
  return (
    <section className="booking-confirmation container">
      <p className="eyebrow">درخواست شما ثبت شد</p>
      <h1>{appointment.status === "confirmed" ? "نوبت شما تأیید شد." : "درخواست نوبت دریافت شد."}</h1>
      {appointment.status !== "confirmed" && <p>ثبت درخواست به معنی تأیید نهایی نوبت نیست. برای هماهنگی، با سالن در تماس باشید.</p>}
      <p>
        کد پیگیری شما: <strong>{appointment.confirmation_code}</strong>
      </p>
      <div className="confirmation-actions"><button type="button" onClick={copyCode}>کپی کد پیگیری</button>{navigator.share && <button type="button" onClick={share}>اشتراک‌گذاری</button>}<button type="button" onClick={() => window.print()}>چاپ رسید</button></div>
      <div className="confirmation-card">
        <h2>جزئیات نوبت</h2>
        {appointment.items?.map((item) => (
          <div key={item.id}>
            <b>{item.service_name || "سرویس بهارناژ"}</b>
            <span>
              {formatJalaliDate(item.date, "تاریخ نامشخص")} · {item.start_time} تا {item.end_time}
            </span>
            {item.employee_name && <small>متخصص: {item.employee_name}</small>}
          </div>
        ))}
        {duration > 0 && <p>مدت کل: {new Intl.NumberFormat("fa-IR").format(duration)} دقیقه</p>}
        {appointment.appointment_total > 0 && <p>مبلغ: {new Intl.NumberFormat("fa-IR").format(appointment.appointment_total)} تومان</p>}
      </div>
      <TelegramConnect receipt={appointment.telegram_receipt} compact />
      {appointment.account_created && <button className="button" onClick={() => navigate("/account")}>مشاهده نوبت در حساب من <span>←</span></button>}
      {!appointment.account_created && <button className="button button-secondary" onClick={() => navigate("/booking/manage")}>پیگیری یا مدیریت نوبت</button>}
      <button className="button" onClick={() => navigate("/")}>
        بازگشت به خانه <span>←</span>
      </button>
    </section>
  );
}
