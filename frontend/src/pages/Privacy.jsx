import { PageIntro } from "../components/PublicLayout";

export default function Privacy() {
  return (
    <>
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
