import { Link, useParams } from 'react-router-dom'
import { PageIntro } from '../components/PublicLayout'
import { toman } from '../shared/api'
import { useServices } from '../shared/hooks'

export default function ServiceDetail() {
  const { id } = useParams()
  const { services } = useServices()
  const service = services.find((item) => String(item.id) === id)
  if (!service) return <PageIntro eyebrow="خدمت" title="در حال دریافت اطلاعات..." text="لطفاً چند لحظه دیگر دوباره تلاش کنید." />
  return <section className="detail container"><div className="detail-image"><img src={service.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1000&q=85'} alt={service.persian_name} /></div><div><p className="eyebrow">خدمت اختصاصی بهارناژ</p><h1>{service.persian_name}</h1><p className="detail-text">{service.description}</p><div className="detail-meta"><strong>{toman(service.price)}</strong><span>{new Intl.NumberFormat('fa-IR').format(service.duration)} دقیقه</span></div><Link className="button" to={`/book?service=${service.id}`}>رزرو این خدمت <span>←</span></Link></div></section>
}
