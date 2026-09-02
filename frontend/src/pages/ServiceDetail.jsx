import { Link, useParams } from 'react-router-dom'
import { MediaImage, PublicState } from '../components/PublicUI'
import { toman } from '../shared/api'
import { useServices } from '../shared/hooks'

export default function ServiceDetail() {
  const { id } = useParams()
  const { services, state } = useServices()
  const service = services.find((item) => String(item.id) === id)
  if (state !== 'ready') return <section className="container detail-state"><PublicState state={state} empty="" /></section>
  if (!service) return <section className="container detail-state"><PublicState state="ready" empty="این خدمت پیدا نشد یا دیگر قابل رزرو نیست." /></section>
  const name = service.persian_name || service.name
  const image = service.images?.[0]?.image_url || service.image_url || service.image
  return <section className="service-detail container"><div className="detail-media"><MediaImage src={image} alt={name} eager /><span>BAHARNAJ / SERVICE</span></div><div className="detail-content"><p className="eyebrow">{service.category_name || service.category?.name || 'خدمت بهارناژ'}</p><h1>{name}</h1>{service.description && <p className="detail-text">{service.description}</p>}<div className="detail-facts"><div><span>زمان</span><strong>{new Intl.NumberFormat('fa-IR').format(service.duration || 0)} دقیقه</strong></div><div><span>هزینه</span><strong>{toman(service.price)}</strong></div></div>{service.employees?.length > 0 && <div className="service-specialists"><span>متخصصان قابل انتخاب</span><div>{service.employees.map((employee) => <b key={employee.id}>{employee.name || 'متخصص بهارناژ'}</b>)}</div></div>}<div className="detail-actions"><Link className="button" to={`/book?service=${service.id}`}>رزرو این خدمت <span>←</span></Link><Link className="text-link" to="/services">بازگشت به خدمات</Link></div></div></section>
}
