import { Link } from "react-router-dom";
import { PageIntro } from "../components/PublicLayout";
import { SEO } from "../components/SEO";
import { siteConfig } from "../shared/siteConfig";

export default function Contact() {
  return (
    <>
      <SEO title="تماس با سالن بهارناژ در رشت | آدرس و ساعت کاری" description="اطلاعات تماس، آدرس و ساعت کاری سالن زیبایی بهارناژ در رشت، گیلان را ببینید یا نوبت خود را آنلاین رزرو کنید." canonicalPath="/contact" />
      <PageIntro
        eyebrow="تماس با بهارناژ"
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
        <div className="contact-business">
          <span>اطلاعات سالن</span>
          <h2>بهارناژ در رشت</h2>
          <address>{siteConfig.province}، {siteConfig.city}، {siteConfig.area}</address>
          <a href={`tel:${siteConfig.mobileInternational}`}><bdi>{siteConfig.mobile}</bdi></a>
          <a href={`tel:${siteConfig.landlineInternational}`}><bdi>{siteConfig.landline}</bdi></a>
          <p>{siteConfig.hoursLabel}<br />ممکن است در تعطیلات سوگواری اسلامی تعطیل باشیم.</p>
          <a href={siteConfig.instagram} target="_blank" rel="noopener noreferrer">Instagram بهارناژ ↗</a>
        </div>
      </section>
    </>
  );
}
