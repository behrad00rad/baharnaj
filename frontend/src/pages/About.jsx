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
        text="بهارناژ، استودیو زیبایی ما در ضیابری رشت. اینجا انتخاب استایل با توست."
        aside={<span className="page-index">۰۳ — داستان ما</span>}
      />
      <section className="about-page container">
        <div className="about-statement">
          <span>بَ</span>
          <h2>زیبایی برای ما یک نسخه ثابت ندارد.</h2>
        </div>
        <div className="about-copy">
          <p>
            قبل از رزرو، نمونه‌کارها را ببین و با تیم آشنا شو. قیمت و مدت هر سرویس هم در دسترس توست.
          </p>
          <p>
            برای انتخاب سرویس سؤال داری؟ با ما تماس بگیر.
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
