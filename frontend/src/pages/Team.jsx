import { PageIntro } from '../components/PublicLayout'
import { EmployeeCard, PublicState } from '../components/PublicUI'
import { usePublicList } from '../shared/hooks'

export default function Team() {
  const { items: employees, state } = usePublicList('employees/')
  return <><PageIntro eyebrow="THE TEAM" title={<>تیم<br /><em>بهارناژ.</em></>} text="متخصصان فعال ما را ببین و هنگام رزرو، برای هر خدمت انتخاب خودت را انجام بده." aside={<span className="page-index">۰۲ — آدم‌های بهارناژ</span>} /><section className="team-page container">{state === 'ready' && employees.length ? <div className="employee-grid employee-grid-full">{employees.map((employee) => <EmployeeCard employee={employee} key={employee.id} />)}</div> : <PublicState state={state} empty="در حال حاضر متخصص فعالی برای نمایش ثبت نشده است." error="دریافت اطلاعات تیم ممکن نیست. لطفاً کمی بعد دوباره تلاش کنید." />}</section></>
}
