import { Fragment } from "react";
import { Link } from "react-router-dom";
import { MediaImage } from "./PublicUI";

const serviceName = (service) => service?.persian_name || service?.name || "سرویس بهارناژ";

export function RichText({ text = "" }) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = String(text).split(pattern);
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = /^(https?:\/\/|mailto:|tel:|\/)/i.test(link[2]) ? link[2] : "#";
      return href.startsWith("/") ? <Link key={index} to={href}>{link[1]}</Link> : <a key={index} href={href} rel="noopener noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>{link[1]}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function BlogServiceCard({ service }) {
  if (!service) return null;
  const image = service.images?.[0];
  const name = serviceName(service);
  return <aside className="article-service-card">
    <div><MediaImage src={image?.image_url} alt={image?.alt_text || name} /></div>
    <section><span>RELATED SERVICE</span><h3>{name}</h3>{(service.short_description || service.description) && <p>{service.short_description || service.description}</p>}<nav><Link className="button" to={`/book?service=${service.id}`}>رزرو این سرویس <span>←</span></Link><Link className="text-link" to={`/services/${service.slug || service.id}`}>جزئیات سرویس</Link></nav></section>
  </aside>;
}

export function BlogContent({ blocks = [], media = [], services = [] }) {
  const mediaById = new Map(media.map((item) => [Number(item.id), item]));
  const serviceById = new Map(services.map((item) => [Number(item.id), item]));
  return <div className="article-content">
    {blocks.map((block, index) => {
      const key = `${block.type}-${index}`;
      if (block.type === "heading") return block.level === 3 ? <h3 key={key}><RichText text={block.text} /></h3> : <h2 key={key}><RichText text={block.text} /></h2>;
      if (block.type === "paragraph") return <p key={key}><RichText text={block.text} /></p>;
      if (block.type === "quote") return <blockquote key={key}><RichText text={block.text} /></blockquote>;
      if (block.type === "separator") return <hr key={key} />;
      if (block.type === "list") {
        const List = block.style === "ordered" ? "ol" : "ul";
        return <List key={key}>{(block.items || []).map((item, itemIndex) => <li key={itemIndex}><RichText text={item} /></li>)}</List>;
      }
      if (block.type === "image") {
        const image = mediaById.get(Number(block.media_id));
        return image ? <figure key={key}><MediaImage src={image.image_url} alt={image.alt_text} /><figcaption>{image.caption || image.alt_text}</figcaption></figure> : null;
      }
      if (block.type === "callout") return <aside key={key} className={`article-callout ${block.tone || "note"}`}>{block.title && <strong>{block.title}</strong>}<p><RichText text={block.text} /></p></aside>;
      if (block.type === "service") return <BlogServiceCard key={key} service={serviceById.get(Number(block.service_id))} />;
      if (block.type === "cta") {
        const linked = (block.service_ids || []).map((id) => serviceById.get(Number(id))).filter(Boolean);
        return <aside key={key} className="article-booking-cta"><span>BAHARNAJ BOOKING</span><h2>{block.title || "این سرویس را در بهارناژ رزرو کنید"}</h2>{block.text && <p>{block.text}</p>}<div>{linked.map((service) => <Link key={service.id} to={`/book?service=${service.id}`}>{serviceName(service)} <span>←</span></Link>)}{!linked.length && <Link to="/book">شروع رزرو <span>←</span></Link>}</div></aside>;
      }
      return null;
    })}
  </div>;
}
