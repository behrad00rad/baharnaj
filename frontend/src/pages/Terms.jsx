import { PageIntro } from "../components/PublicLayout";
import { SEO } from "../components/SEO";

export default function Terms() {
  return (
    <>
      <SEO title="قوانین استفاده | بهارناژ" description="قوانین استفاده و رزرو نوبت در سالن بهارناژ." canonicalPath="/terms" />
      <PageIntro
        eyebrow="بهارناژ"
        title="قوانین استفاده"
        text="رزرو نوبت به معنی پذیرش قوانین سرویس‌ها و زمان‌بندی است."
      />
      <section className="editorial container">
        <h2>قرار ما با شما.</h2>
      </section>
    </>
  );
}
