import { Link, useParams } from "react-router-dom";
import { BlogContent, BlogServiceCard } from "../components/BlogContent";
import { BlogCard } from "../components/BlogCard";
import { SEO } from "../components/SEO";
import { MediaImage, PublicState } from "../components/PublicUI";
import { siteConfig, siteUrl } from "../shared/siteConfig";
import { usePublicDetail } from "../shared/hooks";

const articleDate = (value) => value ? new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(new Date(value)) : "";

export default function BlogArticle() {
  const { slug } = useParams();
  const { item: post, state } = usePublicDetail(`blog/posts/${encodeURIComponent(slug)}/`);
  if (state === "loading") return <><SEO title="در حال دریافت مقاله | بهارناژ" description="مجله بهارناژ" noindex /><section className="container detail-state"><PublicState state="loading" empty="" /></section></>;
  if (state !== "ready" || !post) return <><SEO title="مقاله پیدا نشد | بهارناژ" description="این مقاله منتشر نشده یا در دسترس نیست." noindex /><section className="container detail-state"><PublicState state={state === "error" ? "error" : "ready"} empty="این مقاله پیدا نشد یا در دسترس نیست." /><Link className="text-link" to="/blog">بازگشت به مجله <span>←</span></Link></section></>;
  const canonicalPath = `/blog/${post.slug}`;
  const description = post.seo_description || post.excerpt || post.title;
  const socialImage = post.og_image_url || post.cover_image_url;
  const published = post.published_at || post.scheduled_publish_at || post.created_at;
  const schema = { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description, url: siteUrl(canonicalPath), mainEntityOfPage: siteUrl(canonicalPath), datePublished: published, dateModified: post.updated_at, author: { "@type": "Person", name: post.author_name }, publisher: { "@type": "BeautySalon", name: siteConfig.name, url: siteUrl("/") }, ...(socialImage ? { image: socialImage } : {}) };
  return <>
    <SEO title={post.seo_title || `${post.title} | مجله بهارناژ`} description={description} canonicalPath={canonicalPath} image={socialImage} ogType="article" structuredData={schema} />
    <article className="blog-article">
      <nav className="breadcrumbs container" aria-label="مسیر صفحه"><Link to="/">خانه</Link><span>←</span><Link to="/blog">مجله</Link><span>←</span><span aria-current="page">{post.category?.name || post.title}</span></nav>
      <header className="article-header container"><span>{post.category?.name || "مجله بهارناژ"}</span><h1>{post.title}</h1>{post.excerpt && <p>{post.excerpt}</p>}<div><time dateTime={published}>{articleDate(published)}</time><span>نوشته {post.author_name}</span></div></header>
      <div className="article-hero container"><MediaImage src={post.cover_image_url} alt={post.cover_alt_text || post.title} eager /></div>
      <main className="article-reading"><BlogContent blocks={post.content} media={post.media} services={post.related_services} /></main>
      {!!post.related_services?.length && <section className="article-related-services container"><p className="eyebrow">FROM READING TO DOING</p><h2>سرویس‌های مرتبط در بهارناژ</h2><div>{post.related_services.slice(0, 3).map((service) => <BlogServiceCard key={service.id} service={service} />)}</div></section>}
      {!!post.related_articles?.length && <section className="article-related container"><p className="eyebrow">KEEP READING</p><h2>مطالب مرتبط</h2><div>{post.related_articles.map((item) => <BlogCard key={item.id} post={item} compact />)}</div></section>}
    </article>
  </>;
}
