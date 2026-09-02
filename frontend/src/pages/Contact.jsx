import { Link } from "react-router-dom";
import { PageIntro } from "../components/PublicLayout";

export default function Contact() {
  return (
    <>
      <PageIntro
        eyebrow="CONTACT"
        title={
          <>
            از رزرو تا
            <br />
            <em>دیدار.</em>
          </>
        }
        text="برای هماهنگی یک نوبت، مسیر رزرو آنلاین سریع‌ترین راه است. سرویس، متخصص و ساعت آزاد را همان‌جا انتخاب کن."
        aside={<span className="page-index">۰۴ — ارتباط</span>}
      />
      <section className="contact-page container">
        <div>
          <span>رزرو آنلاین</span>
          <h2>نوبت بعدی‌ات را پیدا کن.</h2>
          <p>زمان‌های نمایش‌داده‌شده مستقیماً از برنامه فعال سالن می‌آیند.</p>
          <Link className="button" to="/book">
            شروع رزرو <span>←</span>
          </Link>
        </div>
        <div>
          <span>قبل از رزرو</span>
          <h2>اول سرویس‌ها و تیم را ببین.</h2>
          <p>جزئیات قیمت، مدت سرویس و متخصصان قابل انتخاب در دسترس است.</p>
          <div className="contact-links">
            <Link to="/services">مشاهده سرویس‌ها ←</Link>
            <Link to="/team">آشنایی با تیم ←</Link>
          </div>
        </div>
      </section>
    </>
  );
}
