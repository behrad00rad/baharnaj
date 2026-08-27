import { PageIntro } from '../components/PublicLayout'
import { ServiceGrid } from '../components/ServiceGrid'
import { useServices } from '../shared/hooks'

export default function Services() {
  const { services, state } = useServices()
  return <><PageIntro eyebrow="برای درخشش تو" title="خدمات ما" text="خدماتی دقیق و آرام، برای لحظه‌هایی که فقط به خودت تعلق دارند." />{state === 'error' && <p className="notice container">ارتباط با سرور برقرار نشد؛ نمایش اطلاعات نمونه برای پیش‌نمایش.</p>}<ServiceGrid services={services} /></>
}
