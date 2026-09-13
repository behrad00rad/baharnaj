import { PageIntro } from "../components/PublicLayout";
import { EmployeeCard, PublicState } from "../components/PublicUI";
import { usePublicList } from "../shared/hooks";
import { SEO } from "../components/SEO";

export default function Team() {
  const { items: employees, state } = usePublicList("employees/");
  return (
    <>
      <SEO
        title="تیم سالن بهارناژ در رشت | متخصصان زیبایی"
        description="با متخصصان فعال سالن بهارناژ در رشت آشنا شوید و هنگام رزرو، متخصص سرویس خود را انتخاب کنید."
        canonicalPath="/team"
      />
      <PageIntro
        eyebrow="تیم بهارناژ"
        title={
          <>
            تیم
            <br />
            <em>بهارناژ.</em>
          </>
        }
        text="متخصصان فعال ما را ببین و هنگام رزرو، برای هر سرویس انتخاب خودت را انجام بده."
        aside={<span className="page-index">۰۲ — آدم‌های بهارناژ</span>}
      />
      <section className="team-page container">
        {state === "ready" && employees.length ? (
          <div className="employee-grid employee-grid-full">
            {employees.map((employee) => (
              <EmployeeCard employee={employee} key={employee.id} />
            ))}
          </div>
        ) : (
          <PublicState
            state={state}
            empty="در حال حاضر متخصص فعالی برای نمایش ثبت نشده است."
            error="دریافت اطلاعات تیم ممکن نیست. لطفاً کمی بعد دوباره تلاش کنید."
          />
        )}
      </section>
    </>
  );
}
