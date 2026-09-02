import { Link } from "react-router-dom";
import { toman } from "../shared/api";
import { PublicState } from "./PublicUI";

export function ServiceCard({ service, index = 0 }) {
  const name = service.persian_name || service.name;
  const category = service.category_name || service.category?.name;
  return (
    <article className="service-card">
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
        {service.description && <p>{service.description}</p>}
      </div>
      <div className="service-meta">
        <span>{toman(service.price)}</span>
        <span>
          {new Intl.NumberFormat("fa-IR").format(service.duration || 0)} دقیقه
        </span>
      </div>
      <div className="service-card-actions">
        <Link to={`/services/${service.id}`}>جزئیات</Link>
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
