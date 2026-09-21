import { useState } from "react";
import { PageIntro } from "../components/PublicLayout";
import { ServiceGrid } from "../components/ServiceGrid";
import { useServices } from "../shared/hooks";
import { SEO } from "../components/SEO";

export default function Services() {
  const { services, state } = useServices();
  const [category, setCategory] = useState("همه");
  const categories = [
    "همه",
    ...new Set(
      services
        .map((service) => service.category_name || service.category?.name)
        .filter(Boolean),
    ),
  ];
  const visible =
    category === "همه"
      ? services
      : services.filter(
          (service) =>
            (service.category_name || service.category?.name) === category,
        );
  return (
    <>
      <SEO
        title="سرویس‌های زیبایی در رشت | سالن بهارناژ"
        description="فهرست واقعی سرویس‌های سالن بهارناژ در رشت را با قیمت، مدت زمان و امکان رزرو آنلاین ببینید."
        canonicalPath="/services"
      />
      <PageIntro
        eyebrow="سرویس‌های بهارناژ"
        title={
          <>
            انتخاب
            <br />
            <em>سرویس‌ها.</em>
          </>
        }
        text="جزئیات سرویس‌ها و مبنای هزینه را ببین؛ سپس متخصص و زمان مناسب را انتخاب کن."
        aside={
          <span className="page-index">
            ۰۱ — {new Intl.NumberFormat("fa-IR").format(services.length)} سرویس
          </span>
        }
      />
      <section className="services-page container">
        <nav className="filter-strip" aria-label="دسته‌بندی سرویس‌ها">
          {categories.map((item) => (
            <button
              aria-pressed={category === item}
              className={category === item ? "active" : ""}
              type="button"
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <ServiceGrid
          services={visible}
          state={state}
          empty="در این دسته سرویسی ثبت نشده است."
        />
      </section>
    </>
  );
}
