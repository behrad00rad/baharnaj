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
      <form onSubmit={submit}>
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
        {error && <p className="error">{error}</p>}
        {location.state?.reset && <p role="status">رمز عبور تغییر کرد؛ اکنون وارد شوید.</p>}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "در حال ورود…" : <>ورود <span>←</span></>}
        </button>
        {customerOnly && <><Link to="/account/forgot-password">رمز عبور را فراموش کرده‌اید؟</Link><p>حساب ندارید؟ <Link to="/account/signup">ساخت حساب مشتری</Link></p></>}
        <Link className="login-switch" to={customerOnly ? "/staff/login" : "/account/login"}>{customerOnly ? "ورود کارکنان" : "ورود به حساب مشتری"}</Link>
      </form>
    </section>
    </>
  );
}
