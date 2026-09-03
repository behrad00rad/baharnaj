import { useEffect } from "react";
import { publicImageUrl, siteConfig, siteUrl } from "../shared/siteConfig";

function setHeadElement(tagName, key, attributes) {
  let element = document.head.querySelector(`[data-baharnaj-seo="${key}"]`);
  if (!element) {
    element = document.createElement(tagName);
    element.dataset.baharnajSeo = key;
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => {
    if (value === undefined || value === null || value === "") element.removeAttribute(name);
    else element.setAttribute(name, value);
  });
}

function removeHeadElement(key) {
  document.head.querySelector(`[data-baharnaj-seo="${key}"]`)?.remove();
}

export function SEO({ title, description, canonicalPath = "/", image, noindex = false, structuredData, ogType = "website" }) {
  useEffect(() => {
    const canonical = siteUrl(canonicalPath);
    const socialImage = publicImageUrl(image);
    document.documentElement.lang = "fa";
    document.documentElement.dir = "rtl";
    document.title = title;
    setHeadElement("meta", "description", { name: "description", content: description });
    setHeadElement("link", "canonical", { rel: "canonical", href: canonical });
    [
      ["og-title", { property: "og:title", content: title }],
      ["og-description", { property: "og:description", content: description }],
      ["og-type", { property: "og:type", content: ogType }],
      ["og-url", { property: "og:url", content: canonical }],
      ["og-site-name", { property: "og:site_name", content: siteConfig.name }],
      ["og-locale", { property: "og:locale", content: "fa_IR" }],
      ["twitter-card", { name: "twitter:card", content: socialImage ? "summary_large_image" : "summary" }],
      ["twitter-title", { name: "twitter:title", content: title }],
      ["twitter-description", { name: "twitter:description", content: description }],
    ].forEach(([key, attributes]) => setHeadElement("meta", key, attributes));
    if (socialImage) {
      setHeadElement("meta", "og-image", { property: "og:image", content: socialImage });
      setHeadElement("meta", "twitter-image", { name: "twitter:image", content: socialImage });
    } else {
      removeHeadElement("og-image");
      removeHeadElement("twitter-image");
    }
    setHeadElement("meta", "robots", { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow" });
    const verification = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION;
    if (verification) setHeadElement("meta", "google-verification", { name: "google-site-verification", content: verification });
    else removeHeadElement("google-verification");
    if (structuredData) {
      const safeJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");
      setHeadElement("script", "structured-data", { type: "application/ld+json" });
      document.head.querySelector('[data-baharnaj-seo="structured-data"]').textContent = safeJson;
    } else {
      removeHeadElement("structured-data");
    }
  }, [title, description, canonicalPath, image, noindex, structuredData, ogType]);
  return null;
}
