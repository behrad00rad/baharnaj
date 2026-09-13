import { formatServicePrice } from "../shared/pricing";
import { Link } from "react-router-dom";
import { MediaImage, PublicState } from "./PublicUI";

export function ServiceCard({ service, index = 0 }) {
  const name = service.persian_name || service.name;
  const category = service.category_name || service.category?.name;
  const image = service.images?.[0];
  return (
    <article className="service-card">
      {image?.image_url && <Link className="service-card-media" to={`/services/${service.slug || service.id}`}><MediaImage src={image.image_url} alt={image.alt_text || `${name} در بهارناژ`} /></Link>}
      <div className="service-card-top">
        <span>
          {new Intl.NumberFormat("fa-IR", {
            minimumIntegerDigits: 2,
            useGrouping: false,
          }).format(index + 1)}
        </span>
        {category && <small>{category}</small>}
      </div>
      <div className="service-card-copy">
        <h3>{name}</h3>
        {(service.short_description || service.description) && <p>{service.short_description || service.description}</p>}
      </div>
      <div className="service-meta">
        <span>{formatServicePrice(service)}</span>
        {service.duration > 0 && <span>{new Intl.NumberFormat("fa-IR").format(service.duration)} دقیقه</span>}
      </div>
      <div className="service-card-actions">
        <Link to={`/services/${service.slug || service.id}`}>جزئیات خدمات</Link>
        <Link to={`/book?service=${service.id}`}>
          رزرو <span>←</span>
        </Link>
      </div>
    </article>
  );
}

export function ServiceGrid({
  services,
  state = "ready",
  empty = "در حال حاضر سرویسی برای نمایش ثبت نشده است.",
}) {
  if (state !== "ready" || !services.length)
    return (
      <PublicState
        state={state}
        empty={empty}
        error="دریافت فهرست سرویس‌ها ممکن نیست. لطفاً دوباره تلاش کنید."
      />
    );
  return (
    <div className="service-grid">
      {services.map((service, index) => (
        <ServiceCard service={service} index={index} key={service.id} />
      ))}
    </div>
  );
}
