export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\u200C|\u200D|\u0640/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function matchesSearch(item, query, fields = []) {
  const needle = normalizeSearch(query);
  return !needle || fields.some((field) => normalizeSearch(typeof field === "function" ? field(item) : item[field]).includes(needle));
}

export const serviceSearchFields = ["persian_name", "name", "category_name", "short_description", "description", (item) => item.category?.name];
export const employeeSearchFields = ["name", "specialty", "bio", (item) => (item.services || []).map((service) => service.name).join(" ")];
