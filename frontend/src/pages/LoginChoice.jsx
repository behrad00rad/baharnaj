import { Link } from "react-router-dom";
import { SEO } from "../components/SEO";

export default function LoginChoice() {
  return <>
    <SEO title="ورود به بهارناژ" description="انتخاب نوع حساب برای ورود امن به بهارناژ." canonicalPath="/login" noindex />
    <section className="login-choice container">
      <header>
        <p className="eyebrow">ورود امن</p>
        <h1>چطور می‌خواهید وارد شوید؟</h1>
        <p>مسیر حساب خود را انتخاب کنید؛ پس از ورود مستقیماً به پنل مربوط هدایت می‌شوید.</p>
      </header>
      <div className="login-choice-grid">
        <Link className="login-choice-card customer" to="/account/login">
          <span aria-hidden="true">♡</span>
          <div><small>برای رزروکنندگان</small><h2>حساب مشتری</h2><p>نوبت‌ها، رسیدها، اعلان‌ها و اطلاعات خود را مدیریت کنید.</p></div>
          <b>ورود مشتری ←</b>
        </Link>
        <Link className="login-choice-card staff" to="/staff/login">
          <span aria-hidden="true">✦</span>
          <div><small>ویژه همکاران سالن</small><h2>ورود کارکنان</h2><p>مدیران و متخصصان از این مسیر وارد پنل کاری می‌شوند.</p></div>
          <b>ورود کارکنان ←</b>
        </Link>
      </div>
      <p className="login-choice-help">حساب مشتری ندارید؟ <Link to="/account/signup">ساخت حساب مشتری</Link></p>
    </section>
  </>;
}
