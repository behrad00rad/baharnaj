import { Link } from 'react-router-dom'
import { toman } from '../shared/api'

export function ServiceGrid({ services }) {
  return <section className="services container"><div className="section-heading"><div><p className="eyebrow">انتخاب تو</p><h2>خدمات محبوب</h2></div><Link to="/services">مشاهده همه <span>←</span></Link></div>{services.length ? <div className="service-grid">{services.map((service) => <article className="service-card" key={service.id}><div className="service-number">۰{service.id}</div><h3>{service.persian_name}</h3><p>{service.description}</p><div className="service-meta"><span>{toman(service.price)}</span><span>{new Intl.NumberFormat('fa-IR').format(service.duration)} دقیقه</span></div><Link to={`/services/${service.id}`}>جزئیات خدمت <span>←</span></Link></article>)}</div> : <p className="state">در حال دریافت خدمات...</p>}</section>
}
