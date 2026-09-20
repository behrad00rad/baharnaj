import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../shared/api";
import { setSession } from "../shared/auth";
import { SEO } from "../components/SEO";
import PasswordInput from "../components/PasswordInput";

const errorText = (error, fallback) => {
  const data = error.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  const first = data && Object.values(data)[0];
  return Array.isArray(first) ? first[0] : typeof first === "string" ? first : fallback;
};

export function CustomerSignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", password: "", password_confirm: "", accept_terms: false });
  const [state, setState] = useState({ busy: false, error: "" });
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setState({ busy: true, error: "" });
    try {
      await api.get("auth/csrf/");
      const { data } = await api.post("auth/register/", form);
      setSession(data.access, data.role);
      navigate("/account", { replace: true });
    } catch (error) {
      setState({ busy: false, error: errorText(error, "ساخت حساب انجام نشد.") });
    }
  };
  return <AuthShell title="ساخت حساب مشتری" text="با حساب مشتری، نوبت‌ها و پیام‌های خود را یک‌جا مدیریت کنید.">
    <form onSubmit={submit}>
      <label>نام<input required name="first_name" autoComplete="given-name" value={form.first_name} onChange={change} /></label>
      <label>نام خانوادگی<input name="last_name" autoComplete="family-name" value={form.last_name} onChange={change} /></label>
      <label>شماره موبایل<input required name="phone" type="tel" inputMode="tel" pattern="(?:\+98|0098|0)9[0-9]{9}" autoComplete="tel" value={form.phone} onChange={change} /></label>
      <label>ایمیل بازیابی<input required name="email" type="email" autoComplete="email" value={form.email} onChange={change} /></label>
      <label>رمز عبور<PasswordInput required name="password" autoComplete="new-password" value={form.password} onChange={change} /></label>
      <label>تکرار رمز عبور<PasswordInput visibilityLabel="تکرار رمز عبور" required name="password_confirm" autoComplete="new-password" value={form.password_confirm} onChange={change} /></label>
      <label className="check-label"><input required name="accept_terms" type="checkbox" checked={form.accept_terms} onChange={change} /> <span><Link to="/terms">قوانین</Link> و <Link to="/privacy">حریم خصوصی</Link> را می‌پذیرم.</span></label>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button className="button" disabled={state.busy}>{state.busy ? "در حال ساخت حساب…" : "ساخت حساب"}</button>
      <p>حساب دارید؟ <Link to="/account/login">وارد شوید</Link></p>
    </form>
  </AuthShell>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event) => { event.preventDefault(); const { data } = await api.post("auth/password-reset/", { email }); setMessage(data.detail); };
  return <AuthShell title="بازیابی رمز عبور" text="لینک انتخاب رمز جدید به ایمیل بازیابی حساب ارسال می‌شود."><form onSubmit={submit}><label>ایمیل<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{message && <p role="status">{message}</p>}<button className="button">ارسال لینک بازیابی</button><Link to="/account/login">بازگشت به ورود</Link></form></AuthShell>;
}

export function ResetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) return setError("تکرار رمز عبور مطابقت ندارد.");
    try { await api.post(`auth/password-reset/${uid}/${token}/`, { new_password: form.password }); navigate("/account/login", { replace: true, state: { reset: true } }); }
    catch (requestError) { setError(errorText(requestError, "لینک بازیابی معتبر نیست.")); }
  };
  return <AuthShell title="رمز عبور جدید" text="یک رمز عبور امن و تازه برای حساب خود انتخاب کنید."><form onSubmit={submit}><label>رمز جدید<PasswordInput visibilityLabel="رمز جدید" required autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label>تکرار رمز جدید<PasswordInput visibilityLabel="تکرار رمز جدید" required autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="button">ذخیره رمز جدید</button></form></AuthShell>;
}

function AuthShell({ title, text, children }) {
  return <><SEO title={`${title} | بهارناژ`} description={text} noindex /><section className="login-page account-auth container"><div><p className="eyebrow">حساب مشتری بهارناژ</p><h1>{title}</h1><p>{text}</p></div>{children}</section></>;
}
