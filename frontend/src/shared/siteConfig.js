const configuredUrl = (import.meta.env.VITE_SITE_URL || "https://baharnaj.ir").trim();

export const siteConfig = {
  name: "سالن زیبایی بهارناژ",
  brand: "Baharnaj",
  siteUrl: configuredUrl.replace(/\/$/, ""),
  city: "رشت",
  province: "گیلان",
  area: "فاز ۲ ضیابری، رو به روی ساختمان خورشید",
  address: "رشت، فاز ۲ ضیابری، رو به روی ساختمان خورشید",
  country: "ایران",
  hoursLabel: "هر روز، ۹ تا ۲۱",
  mobile: "09111375136",
  mobileInternational: "+989111375136",
  landline: "0133520572",
  landlineInternational: "+98133520572",
  instagram: "https://www.instagram.com/baharnaj_official/",
};

export function siteUrl(path = "/") {
  const cleanPath = path.split(/[?#]/)[0] || "/";
  return `${siteConfig.siteUrl}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
}

export function publicImageUrl(image) {
  if (!image) return undefined;
  return /^https?:\/\//.test(image) ? image : siteUrl(image);
}

export function beautySalonSchema() {
  const address = `${siteConfig.address}، ${siteConfig.country}`;
  return {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    "@id": `${siteUrl("/")}#business`,
    name: siteConfig.name,
    alternateName: siteConfig.brand,
    url: siteUrl("/"),
    telephone: siteConfig.mobileInternational,
    address: { "@type": "PostalAddress", streetAddress: siteConfig.area, addressLocality: siteConfig.city, addressRegion: siteConfig.province, addressCountry: "IR" },
    sameAs: [siteConfig.instagram],
    openingHoursSpecification: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((dayOfWeek) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek,
      opens: "09:00",
      closes: "21:00",
    })),
    description: `${siteConfig.name} در ${address}`,
  };
}
