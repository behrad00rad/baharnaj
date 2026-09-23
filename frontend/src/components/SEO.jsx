import { brandCopy } from "../shared/brandCopy";
import { createContext, useContext, useEffect } from "react";
import { publicImageUrl, siteConfig, siteUrl } from "../shared/siteConfig";

export const SEOCollectorContext = createContext(null);
export function seoTags({ title = brandCopy.title, description, canonicalPath = "/", image, noindex = false, structuredData, ogType = "website" }) {
  const canonical = siteUrl(canonicalPath);
  const socialImage = publicImageUrl(image);
  const tags = [
    ["meta", "description", { name: "description", content: description }],
    ["link", "canonical", { rel: "canonical", href: canonical }],
    ["meta", "og-title", { property: "og:title", content: title }],
    ["meta", "og-description", { property: "og:description", content: description }],
    ["meta", "og-type", { property: "og:type", content: ogType }],
    ["meta", "og-url", { property: "og:url", content: canonical }],
    ["meta", "og-site-name", { property: "og:site_name", content: siteConfig.name }],
    ["meta", "og-locale", { property: "og:locale", content: "fa_IR" }],
    ["meta", "twitter-card", { name: "twitter:card", content: socialImage ? "summary_large_image" : "summary" }],
    ["meta", "twitter-title", { name: "twitter:title", content: title }],
    ["meta", "twitter-description", { name: "twitter:description", content: description }],
    ["meta", "robots", { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow" }],
  ];
  if (socialImage) tags.push(["meta", "og-image", { property: "og:image", content: socialImage }], ["meta", "twitter-image", { name: "twitter:image", content: socialImage }]);
  const verification = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION;
  if (verification) tags.push(["meta", "google-verification", { name: "google-site-verification", content: verification }]);
  if (structuredData) tags.push(["script", "structured-data", { type: "application/ld+json", text: JSON.stringify(structuredData).replace(/</g, "\\u003c") }]);
  return { title, tags };
}

export function SEO(props) {
  const collector = useContext(SEOCollectorContext);
  if (collector) collector.current = seoTags(props);
  useEffect(() => {
    const { title, tags } = seoTags(props);
    document.title = title;
    const wanted = new Set(tags.map(([, key]) => key));
    document.head.querySelectorAll('[data-baharnaj-seo]').forEach((node) => {
      if (!wanted.has(node.dataset.baharnajSeo)) node.remove();
    });
    for (const [tag, key, attributes] of tags) {
      let element = document.head.querySelector(`[data-baharnaj-seo="${key}"]`);
      if (!element) { element = document.createElement(tag); element.dataset.baharnajSeo = key; document.head.appendChild(element); }
      for (const [name, value] of Object.entries(attributes)) {
        if (name === "text") element.textContent = value;
        else if (value === undefined || value === null || value === "") element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  }, [props.title, props.description, props.canonicalPath, props.image, props.noindex, props.structuredData, props.ogType]);
  return null;
}
