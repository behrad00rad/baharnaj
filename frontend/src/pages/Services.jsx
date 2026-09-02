import { useState } from "react";
import { PageIntro } from "../components/PublicLayout";
import { ServiceGrid } from "../components/ServiceGrid";
import { useServices } from "../shared/hooks";

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
      <PageIntro
        eyebrow="SERVICES"
        title={
          <>
            منوی
            <br />
            <em>سرویس‌ها.</em>
          </>
        }
        text="سرویس مناسب را بر اساس زمان، قیمت و چیزی که برایت مهم است پیدا کن. از همین صفحه می‌توانی مستقیم وارد رزرو شوی."
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
