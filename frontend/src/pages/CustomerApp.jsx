import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../shared/api";
import { siteConfig } from "../shared/siteConfig";
import { JalaliDatePicker } from "../components/DatePicker";
import PasswordInput from "../components/PasswordInput";
import { formatJalaliDateTime } from "../shared/date";

const statusLabels = {
  pending: "در انتظار تأیید",
  confirmed: "تأیید شده",
  completed: "انجام شده",
  cancelled: "لغو شده",
};
const paymentLabels = {
  unpaid: "پرداخت‌نشده",
  partially_paid: "پرداخت جزئی",
  paid: "پرداخت کامل",
  partially_refunded: "بازپرداخت جزئی",
  refunded: "بازپرداخت کامل",
};
const paymentMethodLabels = {
  cash: "نقدی",
  card: "کارت",
  bank_transfer: "انتقال بانکی",
  online: "آنلاین",
  other: "سایر",
};
const paymentRecordLabels = {
  pending: "در انتظار تأیید",
  paid: "پرداخت‌شده",
  failed: "ردشده",
  refunded: "بازپرداخت‌شده",
};
const priceLabels = {
  final: "قیمت نهایی",
  unresolved: "قیمت پس از مشاوره مشخص می‌شود",
  estimated: "قیمت تقریبی",
};
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
        dateStyle: "full",
        timeZone: "Asia/Tehran",
      }).format(new Date(`${value}T12:00:00`))
    : "تاریخ مشخص نشده";
const formatMoney = (value) =>
  value == null ? "" : `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;
const pageItems = (data) => data?.results || (Array.isArray(data) ? data : []);

function useRequest(url, initial = null) {
  const [state, setState] = useState({
    data: initial,
    error: "",
    completedKey: null,
  });
  const [revision, setRevision] = useState(0);
  const requestKey = `${url}|${revision}`;
  useEffect(() => {
    let active = true;
    api
      .get(url)
      .then(({ data }) => {
        if (active) setState({ data, error: "", completedKey: requestKey });
      })
      .catch(() => {
        if (active)
          setState({
            data: initial,
            error: "خطا در دریافت اطلاعات. دوباره تلاش کنید.",
            completedKey: requestKey,
          });
      });
    return () => {
      active = false;
    };
  }, [url, initial, revision, requestKey]);
  return {
    ...state,
    loading: state.completedKey !== requestKey,
    reload: () => setRevision((value) => value + 1),
  };
}

function PageHeader({ kicker, title, text, action }) {
  return (
    <header className="customer-page-head">
      <div>
        <span className="customer-kicker">{kicker}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </header>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`customer-status customer-status-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function Pagination({ data, page, setPage }) {
  if (!data || (!data.next && !data.previous)) return null;
  return (
    <nav className="customer-pagination" aria-label="صفحه‌بندی">
      <button
        type="button"
        disabled={!data.previous}
        onClick={() => setPage((value) => Math.max(1, value - 1))}
      >
        صفحه قبل
      </button>
      <span>صفحه {new Intl.NumberFormat("fa-IR").format(page)}</span>
      <button
        type="button"
        disabled={!data.next}
        onClick={() => setPage((value) => value + 1)}
      >
        صفحه بعد
      </button>
    </nav>
  );
}

function AppointmentCard({ appointment, onChanged, featured = false }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cancel = async () => {
    if (!window.confirm("لغو این نوبت را تأیید می‌کنید؟")) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post(`customer/appointments/${appointment.id}/cancel/`, {
        reason: "لغو توسط مشتری",
        idempotency_key: crypto.randomUUID(),
      });
      setMessage("نوبت با موفقیت لغو شد.");
      onChanged?.();
    } catch (error) {
      setMessage(
        error.response?.data?.detail || "لغو نوبت انجام نشد.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article
      className={`customer-panel customer-appointment ${featured ? "customer-appointment-featured" : ""}`}
    >
      <div className="customer-appointment-top">
        <div>
          <StatusBadge status={appointment.status} />
          <h2>{formatDate(appointment.date)}</h2>
          <p>ساعت <bdi>{appointment.start_time || "—"}</bdi></p>
        </div>
        <div className="customer-confirmation-code">
          <small>کد پیگیری</small>
          <strong>{appointment.confirmation_code}</strong>
        </div>
      </div>
      <div className="customer-services">
        {appointment.services?.map((service, index) => (
          <div className="customer-service" key={`${service.name}-${index}`}>
            <span>
              <b>{service.name}</b>
              <small>{service.specialist}</small>
            </span>
            <span
              className={
                service.price == null
                  ? "customer-price-unresolved"
                  : "customer-price"
              }
            >
              {service.price == null
                ? priceLabels[service.price_status]
                : formatMoney(service.price)}
            </span>
          </div>
        ))}
      </div>
      <div className="customer-payment-line">
        <span>وضعیت پرداخت</span>
        <strong>
          {paymentLabels[appointment.payment_status] ||
            appointment.payment_status ||
            "نامشخص"}
        </strong>
      </div>
      {message && (
        <p className="customer-message" role="status">
          {message}
        </p>
      )}
      <div className="customer-actions">
        <Link
          className="customer-primary"
          to={`/account/appointments/${appointment.id}`}
        >
          مشاهده و مدیریت
        </Link>
        {appointment.capabilities?.can_cancel && (
          <button className="secondary" disabled={busy} onClick={cancel}>
            {busy ? "در حال انجام…" : "لغو نوبت"}
          </button>
        )}
        {appointment.capabilities?.policy_code === "policy_not_configured" && (
          <a
            className="secondary"
            href={`tel:${siteConfig.mobileInternational}`}
          >
            تماس با سالن
          </a>
        )}
      </div>
    </article>
  );
}

export default function CustomerApp() {
  const location = useLocation();
  const path = location.pathname;
  if (path === "/account" || path === "/account/") return <Dashboard />;
  if (path === "/account/appointments" || path === "/account/appointments/")
    return <Appointments />;
  if (path === "/account/notifications" || path === "/account/notifications/")
    return <Notifications />;
  if (path === "/account/profile" || path === "/account/profile/")
    return <Profile />;
  if (path === "/account/preferences" || path === "/account/preferences/")
    return <Preferences />;
  const match = path.match(/^\/account\/appointments\/(\d+)\/?$/);
  return match ? <AppointmentDetail id={match[1]} /> : <Dashboard />;
}

function Dashboard() {
  const request = useRequest("customer/dashboard/");
  if (request.loading) return <DashboardSkeleton />;
  if (request.error)
    return <ErrorState message={request.error} retry={request.reload} />;
  const { customer, next_appointment: nextAppointment } = request.data;
  return (
    <>
      <PageHeader
        kicker="حساب مشتری"
        title={`سلام، ${customer.display_name}`}
        text="نوبت بعدی و کارهای مهم حساب شما اینجاست."
        action={
          <Link className="customer-primary" to="/book">
            رزرو نوبت جدید
          </Link>
        }
      />
      {nextAppointment ? (
        <section className="customer-next">
          <div className="customer-section-title">
            <div>
              <span>نوبت بعدی شما</span>
              <h2>همه‌چیز برای مراجعه آماده است</h2>
            </div>
            <Link to="/account/appointments">همه نوبت‌ها ←</Link>
          </div>
          <AppointmentCard
            appointment={nextAppointment}
            featured
            onChanged={request.reload}
          />
        </section>
      ) : (
        <section className="customer-panel customer-empty customer-empty-hero">
          <span aria-hidden="true">✦</span>
          <h2>هنوز نوبت آینده‌ای ندارید</h2>
          <p>سرویس، متخصص و زمان مناسب را در چند مرحله انتخاب کنید.</p>
          <Link className="customer-primary" to="/book">
            شروع رزرو
          </Link>
        </section>
      )}
      <section className="customer-overview-grid" aria-label="خلاصه حساب">
        <Link className="customer-overview-card" to="/account/appointments">
          <span>نوبت‌های آینده</span>
          <strong>
            {new Intl.NumberFormat("fa-IR").format(
              request.data.upcoming_count || 0,
            )}
          </strong>
          <small>مشاهده برنامه ←</small>
        </Link>
        <Link className="customer-overview-card" to="/account/notifications">
          <span>اعلان خوانده‌نشده</span>
          <strong>
            {new Intl.NumberFormat("fa-IR").format(
              request.data.unread_notification_count || 0,
            )}
          </strong>
          <small>مشاهده پیام‌ها ←</small>
        </Link>
        <Link className="customer-overview-card" to="/account/appointments">
          <span>سوابق نوبت</span>
          <strong>
            {new Intl.NumberFormat("fa-IR").format(
              request.data.recent_history_count || 0,
            )}
          </strong>
          <small>مرور سوابق ←</small>
        </Link>
      </section>
    </>
  );
}

function Appointments() {
  const [filter, setFilter] = useState("upcoming");
  const [page, setPage] = useState(1);
  const request = useRequest(
    `customer/appointments/?filter=${filter}&page=${page}`,
  );
  const selectFilter = (value) => {
    setFilter(value);
    setPage(1);
  };
  return (
    <>
      <PageHeader
        kicker="نوبت‌های من"
        title="برنامه و سوابق"
        text="نوبت‌های آینده و مراجعه‌های قبلی را یک‌جا ببینید."
        action={
          <Link className="customer-primary" to="/book">
            رزرو جدید
          </Link>
        }
      />
      <div className="customer-tabs" role="tablist" aria-label="فیلتر نوبت‌ها">
        {[
          ["upcoming", "آینده"],
          ["completed", "انجام‌شده"],
          ["cancelled", "لغوشده"],
        ].map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => selectFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {request.loading ? (
        <Loading />
      ) : request.error ? (
        <ErrorState message={request.error} retry={request.reload} />
      ) : pageItems(request.data).length ? (
        <>
          <div className="customer-appointment-list">
            {pageItems(request.data).map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                onChanged={request.reload}
              />
            ))}
          </div>
          <Pagination data={request.data} page={page} setPage={setPage} />
        </>
      ) : (
        <div className="customer-panel customer-empty">
          <h2>نوبتی در این بخش نیست</h2>
          <p>با تغییر فیلتر می‌توانید سایر سوابق را ببینید.</p>
        </div>
      )}
    </>
  );
}

function AppointmentDetail({ id }) {
  const request = useRequest(`customer/appointments/${id}/`);
  const [reschedule, setReschedule] = useState({
    date: "",
    start_time: "",
  });
  const [slotsState, setSlotsState] = useState({
    date: "",
    items: [],
    error: "",
  });
  const [message, setMessage] = useState("");
  const [bookingAgain, setBookingAgain] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!reschedule.date || !request.data?.services?.length) return;
    let active = true;
    const items = request.data.services.map((service) => ({
      service: service.id,
      employee: service.employee_id,
    }));
    api
      .get(
        `availability/?date=${reschedule.date}&items=${encodeURIComponent(JSON.stringify(items))}`,
      )
      .then(({ data }) => {
        if (active)
          setSlotsState({
            date: reschedule.date,
            items: data.slots || [],
            error: "",
          });
      })
      .catch(() => {
        if (active)
          setSlotsState({
            date: reschedule.date,
            items: [],
            error: "دریافت زمان‌های آزاد انجام نشد.",
          });
      });
    return () => {
      active = false;
    };
  }, [reschedule.date, request.data]);

  if (request.loading) return <Loading />;
  if (request.error || !request.data)
    return (
      <ErrorState
        message={request.error || "نوبت پیدا نشد."}
        retry={request.reload}
      />
    );
  const appointment = request.data;
  const slotsLoading = Boolean(
    reschedule.date && slotsState.date !== reschedule.date,
  );
  const availableSlots = slotsLoading ? [] : slotsState.items;
  const slotsError = slotsLoading ? "" : slotsState.error;

  const submitReschedule = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.post(`customer/appointments/${id}/reschedule/`, {
        ...reschedule,
        idempotency_key: crypto.randomUUID(),
      });
      setMessage("زمان نوبت با موفقیت تغییر کرد.");
      setReschedule({ date: "", start_time: "" });
      request.reload();
    } catch (error) {
      setMessage(
        error.response?.data?.detail || "تغییر زمان انجام نشد.",
      );
    }
  };

  const bookAgain = async () => {
    setBookingAgain(true);
    setMessage("");
    try {
      const { data } = await api.get(
        `customer/appointments/${id}/book-again/`,
      );
      navigate(
        `/book?services=${data.services.map((item) => item.id).join(",")}`,
        { state: { bookAgain: data } },
      );
    } catch {
      setMessage("آماده‌کردن رزرو دوباره انجام نشد.");
      setBookingAgain(false);
    }
  };

  return (
    <>
      <PageHeader
        kicker="جزئیات نوبت"
        title={formatDate(appointment.date)}
        text={`ساعت ${appointment.start_time || "—"} · کد پیگیری ${appointment.confirmation_code}`}
        action={
          <button
            className="customer-primary"
            type="button"
            disabled={bookingAgain}
            onClick={bookAgain}
          >
            {bookingAgain ? "در حال آماده‌سازی…" : "رزرو دوباره"}
          </button>
        }
      />
      <Link className="customer-back-link" to="/account/appointments">
        → بازگشت به نوبت‌ها
      </Link>
      <AppointmentCard appointment={appointment} onChanged={request.reload} />
      {message && (
        <p className="customer-message" role="status">
          {message}
        </p>
      )}
      {appointment.capabilities?.can_reschedule && (
        <form
          className="customer-panel customer-form customer-reschedule"
          onSubmit={submitReschedule}
        >
          <div>
            <span className="customer-kicker">تغییر برنامه</span>
            <h2>انتخاب زمان جدید</h2>
            <p className="customer-readonly">
              همه سرویس‌ها با همان ترتیب و متخصصان فعلی جابه‌جا می‌شوند.
            </p>
          </div>
          <label>
            تاریخ جدید
            <JalaliDatePicker
              value={reschedule.date}
              onChange={(date) =>
                setReschedule({ date, start_time: "" })
              }
            />
          </label>
          {slotsLoading && (
            <p className="customer-readonly" role="status">
              در حال دریافت ساعت‌های آزاد…
            </p>
          )}
          {slotsError && (
            <p className="customer-error" role="alert">
              {slotsError}
            </p>
          )}
          {reschedule.date &&
            !slotsLoading &&
            !slotsError &&
            (availableSlots.length ? (
              <label>
                ساعت آزاد
                <select
                  required
                  value={reschedule.start_time}
                  onChange={(event) =>
                    setReschedule({
                      ...reschedule,
                      start_time: event.target.value,
                    })
                  }
                >
                  <option value="">انتخاب ساعت</option>
                  {availableSlots.map((slot) => (
                    <option value={slot} key={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="customer-readonly">
                در این تاریخ زمان آزادی پیدا نشد.
              </p>
            ))}
          <button
            className="customer-primary"
            disabled={!reschedule.start_time}
          >
            ثبت زمان جدید
          </button>
        </form>
      )}
      <section className="customer-panel customer-receipt">
        <div>
          <span className="customer-kicker">رسید نوبت</span>
          <h2>اطلاعات قابل نگهداری</h2>
        </div>
        <dl>
          <div><dt>کد پیگیری</dt><dd>{appointment.confirmation_code}</dd></div>
          <div><dt>تاریخ</dt><dd>{formatDate(appointment.date)}</dd></div>
          <div><dt>ساعت</dt><dd>{appointment.start_time || "—"}</dd></div>
          <div><dt>پرداخت</dt><dd>{paymentLabels[appointment.payment_status] || "نامشخص"}</dd></div>
        </dl>
        <button
          className="secondary"
          type="button"
          onClick={() => window.print()}
        >
          چاپ رسید
        </button>
      </section>
      {appointment.payments?.length > 0 && (
        <section className="customer-panel">
          <div className="customer-section-title">
            <div><span>سوابق مالی</span><h2>پرداخت‌ها و بازپرداخت‌ها</h2></div>
          </div>
          <div className="customer-payment-history">
            {appointment.payments.map((payment) => (
              <div key={payment.id}>
                <span>
                  <b>{paymentMethodLabels[payment.payment_method] || payment.payment_method}</b>
                  <small>{paymentRecordLabels[payment.status] || payment.status}</small>
                </span>
                <strong>
                  {formatMoney(payment.amount)}
                  {payment.refunded_total
                    ? ` · بازپرداخت ${formatMoney(payment.refunded_total)}`
                    : ""}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function BirthdayField({ initialValue }) {
  const [value, setValue] = useState(initialValue || "");
  return (
    <label>
      تاریخ تولد
      <input type="hidden" name="birthday" value={value} />
      <JalaliDatePicker value={value} onChange={setValue} minDate="" allowEmpty />
    </label>
  );
}

function Profile() {
  const request = useRequest("customer/profile/");
  const deletionRequest = useRequest("customer/account/deletion-request/");
  const [message, setMessage] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionMessage, setDeletionMessage] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [claimMessage, setClaimMessage] = useState("");
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  if (request.loading) return <Loading />;
  if (request.error)
    return <ErrorState message={request.error} retry={request.reload} />;

  const save = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.patch(
        "customer/profile/",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      setMessage("اطلاعات شما ذخیره شد.");
    } catch {
      setMessage("ذخیره اطلاعات انجام نشد.");
    }
  };
  const requestDeletion = async () => {
    if (
      !window.confirm(
        "درخواست حذف حساب ثبت شود؟ سوابق مالی و نوبت‌ها طبق قانون نگهداری می‌شوند.",
      )
    )
      return;
    try {
      const { data } = await api.post(
        "customer/account/deletion-request/",
        { confirm: true, password: deletionPassword },
      );
      setDeletionMessage(
        data.status === "pending"
          ? "درخواست حذف حساب شما برای بررسی ثبت شد."
          : "درخواست حذف حساب قبلی شما موجود است.",
      );
      deletionRequest.reload();
    } catch (error) {
      setDeletionMessage(
        error.response?.data?.detail || "ثبت درخواست حذف انجام نشد.",
      );
    }
  };
  const cancelDeletion = async () => {
    try {
      await api.delete("customer/account/deletion-request/");
      setDeletionMessage("درخواست حذف حساب لغو شد.");
      deletionRequest.reload();
    } catch (error) {
      setDeletionMessage(error.response?.data?.detail || "لغو درخواست انجام نشد.");
    }
  };
  const claimHistory = async (event) => {
    event.preventDefault();
    setClaimMessage("");
    try {
      const { data } = await api.post("customer/account/claim-history/", { confirmation_code: claimCode });
      setClaimMessage(data.detail);
      setClaimCode("");
    } catch (error) {
      setClaimMessage(error.response?.data?.detail || error.response?.data?.confirmation_code || "افزودن سوابق انجام نشد.");
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    try {
      const { data } = await api.post("customer/password/", passwords);
      setPasswordMessage(data.detail);
      setPasswords({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      });
    } catch (error) {
      const detail = error.response?.data;
      setPasswordMessage(
        detail?.detail ||
          Object.values(detail || {})?.flat?.()[0] ||
          "تغییر رمز انجام نشد.",
      );
    }
  };

  return (
    <>
      <PageHeader
        kicker="پروفایل"
        title="اطلاعات و امنیت حساب"
        text="اطلاعات شخصی و رمز عبور خود را از این بخش مدیریت کنید."
      />
      <div className="customer-settings-grid">
        <form className="customer-panel customer-form" onSubmit={save}>
          <div><span className="customer-kicker">اطلاعات شخصی</span><h2>درباره شما</h2></div>
          <div className="customer-form-two">
            <label>نام<input name="first_name" defaultValue={request.data.first_name || ""} /></label>
            <label>نام خانوادگی<input name="last_name" defaultValue={request.data.last_name || ""} /></label>
          </div>
          <BirthdayField initialValue={request.data.birthday} />
          <label>محله<input name="neighborhood" defaultValue={request.data.neighborhood || ""} /></label>
          <label>ترجیحات سرویس‌ها<textarea name="service_preferences" defaultValue={request.data.service_preferences} maxLength="2000" /></label>
          <div className="customer-readonly-grid">
            <div><small>شماره تماس</small><strong>{request.data.phone || "ثبت نشده"}</strong></div>
            <div><small>ایمیل بازیابی</small><strong>{request.data.email || "ثبت نشده"}</strong></div>
          </div>
          <p className="customer-readonly">برای تغییر شماره تماس یا ایمیل بازیابی، با سالن هماهنگ کنید.</p>
          {message && <p className="customer-message" role="status">{message}</p>}
          <button className="customer-primary">ذخیره تغییرات</button>
        </form>
        <form className="customer-panel customer-form" onSubmit={changePassword}>
          <div><span className="customer-kicker">امنیت حساب</span><h2>تغییر رمز عبور</h2></div>
          <label>رمز فعلی<PasswordInput required visibilityLabel="رمز فعلی" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></label>
          <label>رمز جدید<PasswordInput required visibilityLabel="رمز جدید" autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} /></label>
          <label>تکرار رمز جدید<PasswordInput required visibilityLabel="تکرار رمز جدید" autoComplete="new-password" value={passwords.new_password_confirm} onChange={(event) => setPasswords({ ...passwords, new_password_confirm: event.target.value })} /></label>
          {passwordMessage && <p className="customer-message" role="status">{passwordMessage}</p>}
          <button className="customer-primary">تغییر رمز عبور</button>
        </form>
      </div>
      <form className="customer-panel customer-form" onSubmit={claimHistory}>
        <div><span className="customer-kicker">سوابق قدیمی</span><h2>افزودن رزرو قبلی</h2></div>
        <p>برای افزودن امن سوابق مهمان به حساب، کد پیگیری یکی از رزروهای قبلی همین شماره را وارد کنید.</p>
        <label>کد پیگیری<input required value={claimCode} onChange={(event) => setClaimCode(event.target.value)} /></label>
        {claimMessage && <p className="customer-message" role="status">{claimMessage}</p>}
        <button className="customer-secondary">بررسی و افزودن سوابق</button>
      </form>
      <details className="customer-panel customer-danger">
        <summary>حذف حساب و اطلاعات دسترسی</summary>
        <div>
          <p>نوبت‌ها، پرداخت‌ها و سوابق مالی ممکن است برای الزامات قانونی نگهداری شوند. حذف حساب پس از بررسی سالن انجام می‌شود.</p>
          {deletionRequest.data && <p className="customer-message">وضعیت درخواست: {{ pending: "در انتظار بررسی", approved: "تأیید اولیه", rejected: "رد شده", completed: "تکمیل شده", cancelled: "لغو شده" }[deletionRequest.data.status] || deletionRequest.data.status}</p>}
          {(!deletionRequest.data || ["rejected", "cancelled"].includes(deletionRequest.data.status)) && <label className="customer-form">رمز عبور فعلی<PasswordInput visibilityLabel="رمز عبور فعلی" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} autoComplete="current-password" /></label>}
          {deletionMessage && <p role="status">{deletionMessage}</p>}
          {deletionRequest.data?.status === "pending" ? <button className="customer-secondary" type="button" onClick={cancelDeletion}>لغو درخواست حذف</button> : (!deletionRequest.data || ["rejected", "cancelled"].includes(deletionRequest.data.status)) && <button className="customer-danger-button" type="button" onClick={requestDeletion}>ثبت درخواست حذف حساب</button>}
        </div>
      </details>
    </>
  );
}

function Preferences() {
  const request = useRequest("customer/preferences/");
  const [message, setMessage] = useState("");
  if (request.loading) return <Loading />;
  if (request.error)
    return <ErrorState message={request.error} retry={request.reload} />;
  const save = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    try {
      await api.patch("customer/preferences/", {
        operational_reminders: form.operational_reminders.checked,
        promotional_messages: form.promotional_messages.checked,
      });
      setMessage("ترجیحات ارتباطی ذخیره شد.");
    } catch {
      setMessage("ذخیره ترجیحات انجام نشد.");
    }
  };
  return (
    <>
      <PageHeader
        kicker="ترجیحات ارتباطی"
        title="پیام‌هایی که می‌خواهید"
        text="یادآوری‌های ضروری و پیام‌های پیشنهادی را جداگانه کنترل کنید."
      />
      <form className="customer-panel customer-preference-form" onSubmit={save}>
        <label className="customer-preference-row">
          <span><b>یادآوری‌های نوبت</b><small>تغییرات و اطلاعات ضروری مربوط به رزرو شما</small></span>
          <input type="checkbox" name="operational_reminders" defaultChecked={request.data.operational_reminders} />
        </label>
        <label className="customer-preference-row">
          <span><b>پیشنهادها و خبرهای سالن</b><small>اختیاری است و هر زمان می‌توانید آن را خاموش کنید</small></span>
          <input type="checkbox" name="promotional_messages" defaultChecked={request.data.promotional_messages} />
        </label>
        {message && <p className="customer-message" role="status">{message}</p>}
        <button className="customer-primary">ذخیره ترجیحات</button>
      </form>
    </>
  );
}

function Notifications() {
  const [page, setPage] = useState(1);
  const request = useRequest(`customer/notifications/?page=${page}`);
  const navigate = useNavigate();

  const openNotification = async (item) => {
    if (!item.is_read) {
      await api
        .post(`customer/notifications/${item.id}/read/`)
        .catch(() => {});
    }
    if (item.target_url?.startsWith("/account")) navigate(item.target_url);
    else request.reload();
  };

  if (request.loading) return <Loading />;
  if (request.error)
    return <ErrorState message={request.error} retry={request.reload} />;
  const items = pageItems(request.data);
  return (
    <>
      <PageHeader
        kicker="اعلان‌ها"
        title="پیام‌های حساب"
        text="تغییرات مهم نوبت‌ها و حساب شما در این بخش باقی می‌ماند."
        action={
          items.some((item) => !item.is_read) ? (
            <button
              className="customer-primary"
              type="button"
              onClick={async () => {
                await api.post("customer/notifications/read-all/");
                request.reload();
              }}
            >
              خواندن همه
            </button>
          ) : null
        }
      />
      {items.length ? (
        <>
          <div className="customer-notification-list">
            {items.map((item) => (
              <article
                className={`customer-notification ${item.is_read ? "" : "unread"}`}
                key={item.id}
              >
                <span className="customer-notification-dot" aria-hidden="true" />
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.message}</p>
                  <time dateTime={item.created_at}>{formatJalaliDateTime(item.created_at)}</time>
                </div>
                <button type="button" onClick={() => openNotification(item)}>
                  {item.target_url?.startsWith("/account") ? "مشاهده" : item.is_read ? "بستن" : "خواندم"}
                </button>
              </article>
            ))}
          </div>
          <Pagination data={request.data} page={page} setPage={setPage} />
        </>
      ) : (
        <div className="customer-panel customer-empty customer-empty-hero">
          <span aria-hidden="true">✓</span>
          <h2>پیام تازه‌ای ندارید</h2>
          <p>تغییرات مهم نوبت‌ها در اینجا نمایش داده می‌شوند.</p>
        </div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="customer-skeletons" role="status" aria-label="در حال دریافت اطلاعات">
      <span />
      <span />
      <span />
    </div>
  );
}

function Loading() {
  return (
    <div className="customer-panel customer-empty" role="status">
      در حال دریافت اطلاعات…
    </div>
  );
}

function ErrorState({ message, retry }) {
  return (
    <div className="customer-panel customer-error" role="alert">
      <strong>{message}</strong>
      {retry && <button type="button" onClick={retry}>تلاش دوباره</button>}
    </div>
  );
}
