import { Link, useParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { MediaImage, PublicState } from "../components/PublicUI";
import { toman } from "../shared/api";
import { siteConfig, siteUrl } from "../shared/siteConfig";
import { useService, useServices } from "../shared/hooks";

const serviceName = (service) => service?.persian_name || service?.name || "سرویس بهارناژ";

export default function ServiceDetail() {
  const { slug } = useParams();
  const { service, state } = useService(slug);
  const { services } = useServices();

  if (state === "loading") {
    return <><SEO title="در حال دریافت سرویس | بهارناژ" description="جزئیات خدمات سالن بهارناژ در رشت." noindex /><section className="container detail-state"><PublicState state="loading" empty="" /></section></>;
  }
  if (state !== "ready" || !service) {
    return <><SEO title="سرویس پیدا نشد | بهارناژ" description="این سرویس در فهرست فعلی بهارناژ پیدا نشد." noindex /><section className="container detail-state"><PublicState state={state === "error" ? "error" : "ready"} empty="این سرویس پیدا نشد یا دیگر قابل رزرو نیست." /><Link className="text-link" to="/services">مشاهده همه سرویس‌ها <span>←</span></Link></section></>;
  }

  const name = serviceName(service);
  const category = service.category_name || service.category?.name || "سرویس بهارناژ";
  const images = service.images || [];
  const hero = images[0];
  const canonicalPath = `/services/${service.slug}`;
  const title = service.seo_title || `${name} در رشت | سالن زیبایی بهارناژ`;
  const description = service.seo_description || service.short_description || service.description || `${name} در سالن بهارناژ رشت؛ زمان، هزینه و متخصصان قابل انتخاب را ببینید.`;
  const related = services.filter((item) => item.id !== service.id && (item.category_name || item.category?.name) === category).slice(0, 3);
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: siteUrl("/") },
      { "@type": "ListItem", position: 2, name: "سرویس‌ها", item: siteUrl("/services") },
      { "@type": "ListItem", position: 3, name, item: siteUrl(canonicalPath) },
    ] },
    { "@type": "Service", name, description, url: siteUrl(canonicalPath), provider: { "@id": `${siteUrl("/")}#business` }, areaServed: [siteConfig.city, siteConfig.province], ...(hero?.image_url ? { image: hero.image_url } : {}) },
  ] };

  return <>
    <SEO title={title} description={description} canonicalPath={canonicalPath} image={hero?.image_url} structuredData={structuredData} />
    <article className="service-article container">
      <nav className="breadcrumbs" aria-label="مسیر صفحه"><Link to="/">خانه</Link><span aria-hidden="true">←</span><Link to="/services">سرویس‌ها</Link><span aria-hidden="true">←</span><span aria-current="page">{name}</span></nav>
      <header className="service-detail">
        <div className="detail-media"><MediaImage src={hero?.image_url} alt={hero?.alt_text || `${name} در سالن بهارناژ`} eager /><span>BAHARNAJ / SERVICE</span></div>
        <div className="detail-content">
          <p className="eyebrow">{category}</p>
          <h1>{name} در سالن بهارناژ رشت</h1>
          {service.short_description && <p className="service-intro">{service.short_description}</p>}
          <div className="detail-facts"><div><span>زمان</span><strong>{new Intl.NumberFormat("fa-IR").format(service.duration)} دقیقه</strong></div><div><span>هزینه</span><strong>{toman(service.price)}</strong></div></div>
          <div className="detail-actions"><Link className="button" to={`/book?service=${service.id}`}>رزرو این سرویس <span>←</span></Link><Link className="text-link" to="/services">همه سرویس‌ها</Link></div>
        </div>
      </header>
      {(service.description || images.length > 1 || service.employees?.length > 0) && <div className="service-article-body">
        {service.description && <section className="service-copy"><p className="eyebrow">ABOUT THE SERVICE</p><h2>درباره {name}</h2>{service.description.split(/\n+/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>}
        {service.employees?.length > 0 && <aside className="service-specialists"><span>متخصصان قابل انتخاب</span><div>{service.employees.map((employee) => <b key={employee.id}>{employee.name || "متخصص بهارناژ"}</b>)}</div></aside>}
      </div>}
      {images.length > 1 && <section className="service-photo-gallery" aria-labelledby="service-gallery-title"><p className="eyebrow">SERVICE GALLERY</p><h2 id="service-gallery-title">تصاویر {name}</h2><div>{images.slice(1).map((image) => <MediaImage key={image.id} src={image.image_url} alt={image.alt_text || `تصویر ${name} در بهارناژ`} />)}</div></section>}
    </article>
    {related.length > 0 && <section className="related-services container" aria-labelledby="related-services-title"><p className="eyebrow">MORE IN {category}</p><h2 id="related-services-title">سرویس‌های مرتبط</h2><div>{related.map((item) => <Link key={item.id} to={`/services/${item.slug || item.id}`}>{serviceName(item)} <span>←</span></Link>)}</div></section>}
  </>;
}
