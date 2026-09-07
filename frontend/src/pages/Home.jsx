import { Link } from "react-router-dom";
import { ServiceGrid } from "../components/ServiceGrid";
import {
  ArrowLink,
  EmployeeCard,
  MediaImage,
  PublicState,
  SectionHeader,
} from "../components/PublicUI";
import { usePublicList, useServices } from "../shared/hooks";
import { SEO } from "../components/SEO";
import { beautySalonSchema } from "../shared/siteConfig";
import { BlogCard } from "../components/BlogCard";

export default function Home() {
  const { services, state: serviceState } = useServices();
  const { items: gallery, state: galleryState } = usePublicList("gallery/");
  const { items: employees, state: employeeState } =
    usePublicList("employees/");
  const { items: articles, state: articleState } = usePublicList("blog/posts/?page_size=3");
  const heroAsset = gallery[0];

  return (
    <>
      <SEO
        title="سالن زیبایی بهارناژ در رشت | Baharnaj"
        description="سالن زیبایی بهارناژ در رشت؛ سرویس‌های Hair، Nail و Makeup را ببینید، متخصص مناسب را انتخاب کنید و نوبت خود را آنلاین رزرو کنید."
        image={heroAsset?.image_url}
        structuredData={beautySalonSchema()}
      />
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">BAHARNAJ BEAUTY STUDIO</p>
          <h1>
            زیبایی را
            <br />
            <em>خودت تعریف کن.</em>
          </h1>
          <p className="lead">
            استایل بعدی‌ات را انتخاب کن؛ زمانش را آنلاین رزرو کن.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/book">
              رزرو آنلاین <span>←</span>
            </Link>
            <ArrowLink to="/gallery">دیدن نمونه‌کارها</ArrowLink>
          </div>
          <div className="hero-index">
            <span>استودیو زیبایی بهارناژ</span>
            <span>Hair · Nail · Makeup</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-image">
            <MediaImage
              src={heroAsset?.image_url}
              alt={heroAsset?.title || "گالری بهارناژ"}
              eager
            />
          </div>
          <span className="hero-stamp">
            BEAUTY
            <br />
            ON YOUR
            <br />
            TERMS
          </span>
          <p>{heroAsset?.title || "بهارناژ، به سبک تو"}</p>
        </div>
      </section>

      <section className="manifesto container">
        <span className="manifesto-number">۰۱</span>
        <p>
          از یک تغییر کوچک تا یک استایل تازه؛ به سبک خودت.
        </p>
      </section>

      <section className="home-services section-dark">
        <div className="container">
          <SectionHeader
            eyebrow="SERVICES / 02"
            title="سرویس‌هایی برای حالِ تازه."
            text="سرویس‌ها، قیمت‌ها و زمان هر کدام را ببین."
            action={<ArrowLink to="/services">همه سرویس‌ها</ArrowLink>}
          />
          <ServiceGrid services={services.slice(0, 6)} state={serviceState} />
        </div>
      </section>

      <section className="home-work container">
        <SectionHeader
          eyebrow="SELECTED WORK / 03"
          title="کارهای منتخب"
          text="تصاویر واقعی ثبت‌شده در گالری بهارناژ."
          action={<ArrowLink to="/gallery">گالری کامل</ArrowLink>}
        />
        {galleryState === "ready" && gallery.length ? (
          <div className="home-work-grid">
            {gallery.slice(0, 5).map((item, index) => (
              <Link
                className={`work-item work-item-${index + 1}`}
                to="/gallery"
                key={item.id}
              >
                <MediaImage
                  src={item.image_url}
                  alt={item.title || item.category || "نمونه‌کار بهارناژ"}
                />
                <span>
                  <b>{item.title || item.category || "بهارناژ"}</b>
                  {item.category && <small>{item.category}</small>}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <PublicState
            state={galleryState}
            empty="هنوز تصویری در گالری ثبت نشده است."
            error="گالری در حال حاضر در دسترس نیست؛ سایر بخش‌ها همچنان قابل استفاده‌اند."
          />
        )}
      </section>

      <section className="brand-story">
        <div className="container brand-story-grid">
          <div>
            <p className="eyebrow">WHY BAHARNAJ / 04</p>
            <h2>
              یک تجربه،
              <br />
              نه فقط یک نوبت.
            </h2>
          </div>
          <div className="brand-principles">
            <article>
              <span>۰۱</span>
              <h3>انتخاب روشن</h3>
              <p>
                سرویس، متخصص و زمان را قبل از ثبت نهایی می‌بینی و انتخاب می‌کنی.
              </p>
            </article>
            <article>
              <span>۰۲</span>
              <h3>هماهنگ با تو</h3>
              <p>رزرو چند سرویس در یک مسیر ساده، با برنامه زمانی واقعی سالن.</p>
            </article>
            <article>
              <span>۰۳</span>
              <h3>جزئیات دقیق</h3>
              <p>هر سرویس با زمان و قیمت ثبت‌شده خودش نمایش داده می‌شود.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="home-team container">
        <SectionHeader
          eyebrow="THE TEAM / 05"
          title="تیم بهارناژ"
          text="با تیم بهارناژ آشنا شو."
          action={<ArrowLink to="/team">دیدن تیم</ArrowLink>}
        />
        {employeeState === "ready" && employees.length ? (
          <div className="employee-grid">
            {employees.slice(0, 3).map((employee) => (
              <EmployeeCard employee={employee} compact key={employee.id} />
            ))}
          </div>
        ) : (
          <PublicState
            state={employeeState}
            empty="در حال حاضر متخصص فعالی برای نمایش ثبت نشده است."
          />
        )}
      </section>

      <section className="home-blog container">
        <SectionHeader eyebrow="BAHARNAJ EDITORIAL / 06" title="آخرین مطالب" text="راهنماها و ایده‌هایی برای انتخاب آگاهانه‌تر و مراقبت بهتر." action={<ArrowLink to="/blog">مشاهده همه مطالب</ArrowLink>} />
        {articleState === "ready" && articles.length ? <div className="home-blog-grid">{articles.slice(0, 3).map((post) => <BlogCard key={post.id} post={post} compact />)}</div> : <PublicState state={articleState} empty="هنوز مقاله‌ای منتشر نشده است." />}
      </section>

      <section className="booking-callout">
        <div className="container">
          <p className="eyebrow">YOUR NEXT LOOK</p>
          <h2>
            برای تغییر بعدی
            <br />
            <em>آماده‌ای؟</em>
          </h2>
          <p>چند دقیقه تا انتخاب سرویس، متخصص و زمان مناسب فاصله داری.</p>
          <Link className="button button-light" to="/book">
            شروع رزرو <span>←</span>
          </Link>
        </div>
      </section>
    </>
  );
}
