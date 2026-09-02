import { Link } from "react-router-dom";
import { PageIntro } from "../components/PublicLayout";
import { SEO } from "../components/SEO";

export default function About() {
  return (
    <>
      <SEO
        title="درباره سالن بهارناژ در رشت | Baharnaj"
        description="با بهارناژ، سالن زیبایی در رشت، و تجربه شفاف انتخاب سرویس، متخصص و زمان رزرو آشنا شوید."
        canonicalPath="/about"
      />
      <PageIntro
        eyebrow="ABOUT BAHARNAJ"
        title={
          <>
            فضایی برای
            <br />
            <em>انتخاب خودت.</em>
          </>
        }
        text="بهارناژ یک استودیو زیبایی با تجربه‌ای ساده، شفاف و شخصی است؛ از دیدن سرویس‌ها تا انتخاب متخصص و رزرو زمان."
        aside={<span className="page-index">۰۳ — داستان ما</span>}
      />
      <section className="about-page container">
        <div className="about-statement">
          <span>بَ</span>
          <h2>زیبایی برای ما یک نسخه ثابت ندارد.</h2>
        </div>
        <div className="about-copy">
          <p>
            هر تجربه از انتخاب تو شروع می‌شود. به همین دلیل مسیر رزرو بهارناژ
            طوری طراحی شده که سرویس‌ها، متخصصان و زمان‌های واقعی را کنار هم ببینی و
            با آگاهی تصمیم بگیری.
          </p>
          <p>
            آنچه اینجا می‌بینی از اطلاعات واقعی سالن می‌آید؛ بدون وعده‌های
            ساختگی و بدون انتخاب‌های از پیش تعیین‌شده.
          </p>
          <p>بهارناژ در فاز ۲ ضیابری رشت، گیلان قرار دارد و هر روز از ۹ تا ۲۱ پذیرای رزروهای ثبت‌شده است.</p>
          <Link className="button" to="/book">
            انتخاب و رزرو <span>←</span>
          </Link>
        </div>
      </section>
    </>
  );
}
