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
        title="خدمات زیبایی در رشت | سالن بهارناژ"
        description="فهرست واقعی خدمات سالن بهارناژ در رشت را با قیمت، مدت زمان و امکان رزرو آنلاین ببینید."
        canonicalPath="/services"
      />
      <PageIntro
        eyebrow="SERVICES"
        title={
          <>
            منوی
            <br />
            <em>سرویس‌ها.</em>
          </>
        }
        text="سرویس‌ها را ببین، قیمت و زمان را مقایسه کن و نوبتت را رزرو کن."
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
