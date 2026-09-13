import { brandCopy } from "../shared/brandCopy";
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
        eyebrow="داستان بهارناژ"
        title={brandCopy.aboutHeading}
        text={brandCopy.about}
        aside={<span className="page-index">۰۳ — داستان ما</span>}
      />
      <section className="about-page container">
        <div className="about-statement">
          <span aria-hidden="true">ب</span>
          <h2>زیبایی برای ما یک نسخه ثابت ندارد.</h2>
        </div>
        <div className="about-copy">
          <p>
            انتخاب رنگ، فرم یا مدل، از شناخت سلیقهٔ شما شروع می‌شود. نمونه‌کارها می‌توانند نقطهٔ شروعی برای گفت‌وگو باشند؛ جزئیاتی که می‌پسندید را با ما در میان بگذارید.
          </p>
          <p>
            برای انتخاب خدمات، توضیحات و مبنای قیمت هر خدمت را ببینید. اگر هنوز سؤالی دارید، پیش از رزرو با ما تماس بگیرید.
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
