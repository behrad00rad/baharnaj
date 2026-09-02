import { PageIntro } from "../components/PublicLayout";
import { SEO } from "../components/SEO";

export default function Privacy() {
  return (
    <>
      <SEO title="حریم خصوصی | بهارناژ" description="اطلاعات حریم خصوصی رزروهای سالن بهارناژ." canonicalPath="/privacy" />
      <PageIntro
        eyebrow="بهارناژ"
        title="حریم خصوصی"
        text="اطلاعات شما فقط برای هماهنگی سرویس‌ها استفاده می‌شود."
      />
      <section className="editorial container">
        <h2>اعتماد شما برای ما مهم است.</h2>
      </section>
    </>
  );
}
