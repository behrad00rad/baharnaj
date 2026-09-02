import { Link, useParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { MediaImage, PublicState } from "../components/PublicUI";
import { toman } from "../shared/api";
import { siteConfig, siteUrl } from "../shared/siteConfig";
import { useServices } from "../shared/hooks";

const serviceName = (service) => service?.persian_name || service?.name || "سرویس بهارناژ";

export default function ServiceDetail() {
  const { slug: serviceIdentifier } = useParams();
  const { services, state } = useServices();
  const service = services.find((item) => item.slug === serviceIdentifier || String(item.id) === serviceIdentifier);

  if (state !== "ready") return <><SEO title="در حال دریافت سرویس | بهارناژ" description="جزئیات خدمات سالن بهارناژ در رشت." noindex /><section className="container detail-state"><PublicState state={state} empty="" /></section></>;
  if (!service) return <><SEO title="سرویس پیدا نشد | بهارناژ" description="این سرویس در فهرست فعلی بهارناژ پیدا نشد." noindex /><section className="container detail-state"><PublicState state="ready" empty="این سرویس پیدا نشد یا دیگر قابل رزرو نیست." /><Link className="text-link" to="/services">مشاهده همه سرویس‌ها <span>←</span></Link></section></>;

  const name = serviceName(service);
  const category = service.category_name || service.category?.name || "سرویس بهارناژ";
  const image = service.images?.[0]?.image_url || service.image_url || service.image;
  const canonicalPath = `/services/${service.slug || service.id}`;
  const title = service.seo_title || `${name} در رشت | سالن زیبایی بهارناژ`;
  const description = service.seo_description || service.description || `${name} در سالن بهارناژ رشت؛ جزئیات زمان و هزینه را ببینید و در صورت مناسب بودن، نوبت خود را آنلاین ثبت کنید.`;
  const related = services.filter((item) => item.id !== service.id && (item.category_name || item.category?.name) === category).slice(0, 3);
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: siteUrl("/") },
      { "@type": "ListItem", position: 2, name: "سرویس‌ها", item: siteUrl("/services") },
      { "@type": "ListItem", position: 3, name, item: siteUrl(canonicalPath) },
    ] },
    { "@type": "Service", name, description, url: siteUrl(canonicalPath), provider: { "@id": `${siteUrl("/")}#business` }, areaServed: [siteConfig.city, siteConfig.province], ...(image ? { image } : {}) },
  ] };

  return <>
    <SEO title={title} description={description} canonicalPath={canonicalPath} image={image} structuredData={structuredData} />
    <section className="service-detail container">
      <nav className="breadcrumbs" aria-label="مسیر صفحه"><Link to="/">خانه</Link><span aria-hidden="true">←</span><Link to="/services">سرویس‌ها</Link><span aria-hidden="true">←</span><span aria-current="page">{name}</span></nav>
      <div className="detail-media"><MediaImage src={image} alt={`${name} در سالن بهارناژ`} eager /><span>BAHARNAJ / SERVICE</span></div>
      <div className="detail-content">
        <p className="eyebrow">{category}</p>
        <h1>{name} در سالن بهارناژ رشت</h1>
        {service.description && <p className="detail-text">{service.description}</p>}
        <div className="detail-facts"><div><span>زمان</span><strong>{new Intl.NumberFormat("fa-IR").format(service.duration || 0)} دقیقه</strong></div><div><span>هزینه</span><strong>{toman(service.price)}</strong></div></div>
        {service.employees?.length > 0 && <div className="service-specialists"><span>متخصصان قابل انتخاب</span><div>{service.employees.map((employee) => <b key={employee.id}>{employee.name || "متخصص بهارناژ"}</b>)}</div></div>}
        <div className="detail-actions"><Link className="button" to={`/book?service=${service.id}`}>رزرو این سرویس <span>←</span></Link><Link className="text-link" to="/services">بازگشت به سرویس‌ها</Link></div>
      </div>
    </section>
    {related.length > 0 && <section className="related-services container" aria-labelledby="related-services-title"><p className="eyebrow">MORE IN {category}</p><h2 id="related-services-title">سرویس‌های مرتبط</h2><div>{related.map((item) => <Link key={item.id} to={`/services/${item.slug || item.id}`}>{serviceName(item)} <span>←</span></Link>)}</div></section>}
  </>;
}
