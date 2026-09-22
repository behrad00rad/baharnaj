import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../shared/api";
import { setSession } from "../shared/auth";
import { useAuth } from "../shared/auth";
import { SEO } from "../components/SEO";
import PasswordInput from "../components/PasswordInput";

export default function Login({ customerOnly = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, ready } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [challenge, setChallenge] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ready && role) navigate(role === "customer" ? "/account" : role === "employee" ? "/employee" : "/admin", { replace: true }); }, [navigate, ready, role]);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.get("auth/csrf/");
      const { data } = await api.post("auth/token/", form);
      if (data.two_factor_required) {
        if (customerOnly && data.role !== "customer") {
          setError("این صفحه برای حساب مشتری است. برای حساب کارکنان از ورود کارکنان استفاده کنید.");
          return;
        }
        setChallenge(data.two_factor_token);
        setTwoFactorCode("");
        return;
      }
      const role = data.role;
      if (customerOnly && role !== "customer") {
        await api.post("auth/logout/").catch(() => {});
        setError("این صفحه برای حساب مشتری است. برای حساب کارکنان از ورود کارکنان استفاده کنید.");
        return;
      }
      setSession(data.access, data.role);
      navigate(role === "customer" ? "/account" : role === "employee" ? "/employee" : "/admin", { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "اتصال به سرور برقرار نشد یا نام کاربری و رمز عبور صحیح نیست.",
      );
    } finally { setBusy(false); }
  };
  const verifyTwoFactor = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("auth/token/verify-2fa/", { two_factor_token: challenge, code: twoFactorCode });
      setSession(data.access, data.role);
      navigate("/admin", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "تأیید ورود انجام نشد.");
    } finally { setBusy(false); }
  };
  return (
    <>
    <SEO title={customerOnly ? "ورود مشتری | بهارناژ" : "ورود کارکنان | بهارناژ"} description="ورود امن به حساب بهارناژ." canonicalPath={customerOnly ? "/account/login" : "/login"} noindex />
    <section className="login-page container">
      <div>
        <p className="eyebrow">ورود به بهارناژ</p>
        <h1>
          خوش آمدید
          <br />
          <em>دوباره.</em>
        </h1>
        <p>
          {customerOnly ? "برای مدیریت نوبت‌ها و اطلاعات خود وارد شوید." : "برای ورود به پنل مدیریت یا پنل متخصص، اطلاعات حساب خود را وارد کنید."}
        </p>
      </div>
      <form onSubmit={challenge ? verifyTwoFactor : submit}>
        {challenge ? <>
          <p className="login-two-factor-note">برای تکمیل ورود، کد ۶ رقمی برنامه احراز هویت را وارد کنید.</p>
          <label>
            {useRecoveryCode ? "کد بازیابی" : "کد احراز هویت"}
            <input required autoFocus autoComplete="one-time-code" inputMode={useRecoveryCode ? "text" : "numeric"} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} />
          </label>
          <button className="button" type="submit" disabled={busy}>{busy ? "در حال تأیید…" : <>تأیید ورود <span>←</span></>}</button>
          <button className="login-text-button" type="button" onClick={() => { setUseRecoveryCode((value) => !value); setTwoFactorCode(""); }}>
            {useRecoveryCode ? "استفاده از کد برنامه" : "استفاده از کد بازیابی"}
          </button>
          <button className="login-text-button" type="button" onClick={() => { setChallenge(""); setError(""); }}>بازگشت</button>
        </> : <>
        <label>
          شماره تماس یا نام کاربری
          <input
            required
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            autoComplete="username"
          />
        </label>
        <label>
          رمز عبور
          <PasswordInput
              required
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              autoComplete="current-password"
          />
        </label>
        {location.state?.reset && <p role="status">رمز عبور تغییر کرد؛ اکنون وارد شوید.</p>}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "در حال ورود…" : <>ورود <span>←</span></>}
        </button>
        {customerOnly && <><Link to="/account/forgot-password">رمز عبور را فراموش کرده‌اید؟</Link><p>حساب ندارید؟ <Link to="/account/signup">ساخت حساب مشتری</Link></p></>}
        <Link className="login-switch" to={customerOnly ? "/staff/login" : "/account/login"}>{customerOnly ? "ورود کارکنان" : "ورود به حساب مشتری"}</Link>
        </>}
        {error && <p className="error">{error}</p>}
      </form>
    </section>
    </>
  );
}
