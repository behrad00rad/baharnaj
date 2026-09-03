import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { MediaImage, PublicState } from "../components/PublicUI";
import { BlogCard } from "../components/BlogCard";
import { usePublicList } from "../shared/hooks";
import "./Blog.css";

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const { items: posts, state } = usePublicList(`blog/posts/${query}`);
  const { items: categories } = usePublicList("blog/categories/");
  const featured = posts.find((post) => post.is_featured) || posts[0];
  const remaining = posts.filter((post) => post.id !== featured?.id);
  return <>
    <SEO title="مجله زیبایی بهارناژ | راهنما و ترندهای مو، ناخن و میکاپ" description="مجله بهارناژ؛ راهنماهای کاربردی و مطالب تخصصی زیبایی برای انتخاب آگاهانه‌تر خدمات مو، ناخن، میکاپ و مراقبت." canonicalPath="/blog" />
    <header className="blog-index-head container"><p className="eyebrow">BAHARNAJ EDITORIAL</p><div><h1>مجله<br /><em>بهارناژ</em></h1><p>راهنمای انتخاب، مراقبت و ترندهای زیبایی؛ نوشته‌هایی برای تصمیم‌های شخصی‌تر و نتیجه‌ای که بیشتر شبیه خودت باشد.</p></div></header>
    <nav className="blog-category-filter container" aria-label="دسته‌بندی مقالات"><button className={!category ? "active" : ""} onClick={() => setParams({})}>همه مطالب</button>{categories.map((item) => <button className={category === item.slug ? "active" : ""} key={item.id} onClick={() => setParams({ category: item.slug })}>{item.name}<small>{new Intl.NumberFormat("fa-IR").format(item.post_count)}</small></button>)}</nav>
    <main className="blog-index container">
      {state !== "ready" ? <PublicState state={state} empty="هنوز مقاله‌ای منتشر نشده است." /> : !posts.length ? <PublicState state="ready" empty="در این دسته‌بندی هنوز مقاله‌ای منتشر نشده است." /> : <>
        {featured && <section className="featured-post"><MediaImage src={featured.cover_image_url} alt={featured.cover_alt_text || featured.title} eager /><div><p className="eyebrow">FEATURED STORY</p><span>{featured.category?.name || "مجله"}</span><h2><Link to={`/blog/${featured.slug}`}>{featured.title}</Link></h2><p>{featured.excerpt}</p><Link className="button" to={`/blog/${featured.slug}`}>مطالعه مقاله <span>←</span></Link></div></section>}
        {!!remaining.length && <section className="blog-grid" aria-label="فهرست مقالات">{remaining.map((post) => <BlogCard key={post.id} post={post} />)}</section>}
      </>}
    </main>
  </>;
}
