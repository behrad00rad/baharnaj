import { Link } from "react-router-dom";
import { MediaImage } from "./PublicUI";

const articleDate = (value) => value ? new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(new Date(value)) : "";

export function BlogCard({ post, compact = false }) {
  return <article className={`blog-card ${compact ? "compact" : ""}`}>
    {post.cover_image_url && <Link className="blog-card-media" to={`/blog/${post.slug}`}><MediaImage src={post.cover_image_url} alt={post.cover_alt_text || post.title} /></Link>}
    <div className="blog-card-copy"><div><span>{post.category?.name || "مجله بهارناژ"}</span><time dateTime={post.published_at || post.scheduled_publish_at}>{articleDate(post.published_at || post.scheduled_publish_at)}</time></div><h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>{post.excerpt && <p>{post.excerpt}</p>}<Link className="text-link" to={`/blog/${post.slug}`}>خواندن مقاله <span>←</span></Link></div>
  </article>;
}
