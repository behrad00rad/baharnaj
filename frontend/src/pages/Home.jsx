import { Link } from "react-router-dom";
import { brandCopy } from "../shared/brandCopy";
import { siteConfig } from "../shared/siteConfig";
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
        title={brandCopy.title}
        description={brandCopy.intro}
        image={heroAsset?.image_url}
        structuredData={beautySalonSchema()}
      />
      <section className={`hero container ${heroAsset?.image_url ? "" : "hero-no-media"}`}>
        <div className="hero-copy">
          <p className="eyebrow">{brandCopy.descriptor}</p>
          <h1>زیبایی،<br /><em>به سلیقهٔ تو.</em></h1>
          <p className="lead">{brandCopy.intro}</p>
          <div className="hero-actions">
            <Link className="button" to="/book">
              رزرو نوبت <span>←</span>
            </Link>
            <ArrowLink to="/gallery">دیدن نمونه‌کارها</ArrowLink>
          </div>
          <div className="hero-index">
            <span>رشت، ضیابری</span>
            <span>بهارناژ / BAHARNAJ</span>
          </div>
        </div>
        {heroAsset?.image_url && <div className="hero-visual">
          <div className="hero-image">
            <MediaImage
              src={heroAsset?.image_url}
              alt={heroAsset?.title || "گالری بهارناژ"}
              eager
            />
          </div>
          <p>{heroAsset?.title || "بهارناژ، به سبک تو"}</p>
        </div>}
      </section>

      <section className="home-services section-dark">
        <div className="container">
          <SectionHeader
            eyebrow="انتخاب شما"
            title="سرویس‌های بهارناژ"
            text="سرویس‌ها و جزئیات هزینه را ببین و با توجه به سلیقه‌ات انتخاب کن."
            action={<ArrowLink to="/services">همهٔ سرویس‌ها</ArrowLink>}
          />
          <ServiceGrid services={services.slice(0, 3)} state={serviceState} />
        </div>
      </section>

      {(gallery.length > 0 || galleryState !== "ready") && <section className="home-work container">
        <SectionHeader
          eyebrow="نمونه‌کارها"
          title="از نزدیک ببین"
          text="تصاویر واقعی ثبت‌شده در گالری بهارناژ."
          action={<ArrowLink to="/gallery">گالری کامل</ArrowLink>}
        />
        {galleryState === "ready" && gallery.length ? (
          <div className="home-work-grid">
            {gallery.slice(0, 3).map((item, index) => (
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
      </section>}

      <section className="brand-story">
        <div className="container brand-story-grid">
          <div><p className="eyebrow">دربارهٔ بهارناژ</p><h2>{brandCopy.aboutHeading}</h2></div>
          <div className="story-copy"><p>{brandCopy.about}</p><ArrowLink to="/about">بیشتر با ما آشنا شو</ArrowLink></div>
        </div>
      </section>

      {employees.length > 0 && <section className="home-team container">
        <SectionHeader
          eyebrow="آدم‌های بهارناژ"
          title="با تیم بهارناژ آشنا شو"
          text="تخصص‌ها و نمونه‌کارها را ببین؛ انتخاب را از همین‌جا شروع کن."
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
      </section>}

      {articles.length > 0 && <section className="home-blog container">
        <SectionHeader eyebrow="مجلهٔ بهارناژ" title="آخرین مطالب" text="راهنماها و ایده‌هایی برای انتخاب آگاهانه‌تر و مراقبت بهتر." action={<ArrowLink to="/blog">مشاهده همه مطالب</ArrowLink>} />
        {articleState === "ready" && articles.length ? <div className="home-blog-grid">{articles.slice(0, 3).map((post) => <BlogCard key={post.id} post={post} compact />)}</div> : <PublicState state={articleState} empty="هنوز مقاله‌ای منتشر نشده است." />}
      </section>}

      <section className="booking-callout">
        <div className="container visit-grid">
          <div><p className="eyebrow">قرار ما در رشت</p><h2>برای دیدنت آماده‌ایم</h2></div>
          <div>
            <address>{siteConfig.city}، {siteConfig.area}<br />{siteConfig.hoursLabel}<br /><a href={`tel:${siteConfig.mobileInternational}`}><bdi>{siteConfig.mobile}</bdi></a></address>
            <Link className="button" to="/book">رزرو نوبت <span>←</span></Link>
            <p><Link className="text-link" to="/contact">اطلاعات تماس و مراجعه</Link></p>
          </div>
        </div>
      </section>
    </>
  );
}
