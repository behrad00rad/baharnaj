import { useCallback, useEffect, useMemo, useState } from "react";
import { PageIntro } from "../components/PublicLayout";
import { MediaImage, PublicState } from "../components/PublicUI";
import { api } from "../shared/api";
import { SEO } from "../components/SEO";

const unwrap = (data) => data?.results || data || [];

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [category, setCategory] = useState("همه");
  const [activeId, setActiveId] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    Promise.all([api.get("gallery/"), api.get("gallery/categories/")])
      .then(([gallery, categories]) => {
        if (!active) return;
        setItems(unwrap(gallery.data));
        setCategoryOptions(unwrap(categories.data));
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);
  const visibleItems = useMemo(
    () =>
      category === "همه"
        ? items
        : items.filter((item) => item.category === category),
    [category, items],
  );
  const activeIndex = visibleItems.findIndex((item) => item.id === activeId);
  const activeItem = activeIndex >= 0 ? visibleItems[activeIndex] : null;
  const move = useCallback(
    (direction) =>
      setActiveId(
        visibleItems[
          (activeIndex + direction + visibleItems.length) % visibleItems.length
        ]?.id,
      ),
    [activeIndex, visibleItems],
  );
  useEffect(() => {
    if (!activeItem) return undefined;
    document.body.style.overflow = "hidden";
    const keyboard = (event) => {
      if (event.key === "Escape") setActiveId(null);
      if (event.key === "ArrowLeft") move(1);
      if (event.key === "ArrowRight") move(-1);
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", keyboard);
    };
  }, [activeItem, move]);
  const categories = ["همه", ...categoryOptions.map((item) => item.name)];

  return (
    <>
      <SEO
        title="گالری نمونه‌کارهای بهارناژ | سالن زیبایی رشت"
        description="نمونه‌کارهای واقعی منتشرشده از سالن زیبایی بهارناژ در رشت را در گالری ببینید."
        canonicalPath="/gallery"
        image={items[0]?.image_url}
      />
      <PageIntro
        eyebrow="SELECTED WORK"
        title={
          <>
            گالری
            <br />
            <em>بهارناژ.</em>
          </>
        }
        text="مجموعه‌ای از تصاویر واقعی منتشرشده توسط بهارناژ؛ برای دیدن جزئیات، هر تصویر را باز کن."
        aside={<span className="page-index">۰۵ — نمونه‌کارها</span>}
      />
      <section className="gallery-page container">
        {state === "ready" && items.length > 0 && (
          <nav
            className="filter-strip gallery-filters"
            aria-label="دسته‌بندی گالری"
          >
            {categories.map((item) => (
              <button
                className={category === item ? "active" : ""}
                key={item}
                type="button"
                onClick={() => {
                  setCategory(item);
                  setActiveId(null);
                }}
              >
                {item}
              </button>
            ))}
          </nav>
        )}
        {state === "ready" && visibleItems.length ? (
          <div className="gallery-grid">
            {visibleItems.map((item, index) => (
              <button
                className={`gallery-card gallery-card-${index % 6}`}
                type="button"
                key={item.id}
                onClick={() => setActiveId(item.id)}
              >
                <MediaImage
                  src={item.image_url}
                  alt={item.title || item.category || "تصویر گالری بهارناژ"}
                />
                <span className="gallery-card-overlay">
                  <small>{item.category || "بهارناژ"}</small>
                  <strong>{item.title || "بدون عنوان"}</strong>
                  <i>مشاهده</i>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <PublicState
            state={state}
            empty={
              category === "همه"
                ? "هنوز تصویری برای نمایش ثبت نشده است."
                : "در این دسته تصویری ثبت نشده است."
            }
            error="دریافت تصاویر گالری ممکن نیست. لطفاً دوباره تلاش کنید."
          />
        )}
        {activeItem && (
          <div
            className="lightbox"
            role="presentation"
            onMouseDown={() => setActiveId(null)}
          >
            <div
              className="lightbox-content"
              role="dialog"
              aria-modal="true"
              aria-label={activeItem.title || "نمایش تصویر"}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="lightbox-toolbar">
                <span>
                  {new Intl.NumberFormat("fa-IR").format(activeIndex + 1)} /{" "}
                  {new Intl.NumberFormat("fa-IR").format(visibleItems.length)}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  aria-label="بستن"
                >
                  بستن ×
                </button>
              </div>
              <MediaImage
                src={activeItem.image_url}
                alt={activeItem.title || activeItem.category || "تصویر گالری"}
                eager
              />
              <div className="lightbox-caption">
                <div>
                  <small>{activeItem.category}</small>
                  <strong>
                    {activeItem.title || activeItem.category || "بهارناژ"}
                  </strong>
                  {activeItem.description && <p>{activeItem.description}</p>}
                </div>
                {visibleItems.length > 1 && (
                  <div className="lightbox-controls">
                    <button
                      type="button"
                      onClick={() => move(-1)}
                      aria-label="تصویر قبلی"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => move(1)}
                      aria-label="تصویر بعدی"
                    >
                      ←
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
