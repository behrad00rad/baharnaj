import { Link } from "react-router-dom";
import { SEO } from "../components/SEO";

export default function NotFound() {
  return <section className="container detail-state not-found">
    <SEO title="صفحه پیدا نشد | بهارناژ" description="این نشانی در سایت بهارناژ وجود ندارد." noindex />
    <p className="eyebrow">404</p>
    <h1>این صفحه پیدا نشد.</h1>
    <p>ممکن است آدرس تغییر کرده باشد یا دیگر در دسترس نباشد.</p>
    <Link className="button" to="/">بازگشت به خانه <span>←</span></Link>
  </section>;
}
