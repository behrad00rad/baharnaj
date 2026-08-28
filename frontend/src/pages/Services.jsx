import { PageIntro } from '../components/PublicLayout'
import { ServiceGrid } from '../components/ServiceGrid'
import { useServices } from '../shared/hooks'
import { useState } from 'react'

export default function Services() {
  const { services, state } = useServices()
  const [category, setCategory] = useState('همه')
  const categories = ['همه', ...new Set(services.map((service) => service.category_name || service.category?.name).filter(Boolean))]
  const visible = category === 'همه' ? services : services.filter((service) => (service.category_name || service.category?.name) === category)
  return <><PageIntro eyebrow="برای درخشش تو" title="خدمات ما" text="خدماتی دقیق و آرام، برای لحظه‌هایی که فقط به خودت تعلق دارند." />{state === 'error' && <p className="notice container">ارتباط با سرور برقرار نشد؛ نمایش اطلاعات نمونه برای پیش‌نمایش.</p>}<nav className="service-tabs container" aria-label="دسته‌بندی خدمات">{categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</nav><ServiceGrid services={visible} /></>
}
