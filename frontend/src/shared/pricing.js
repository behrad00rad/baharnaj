import { toman } from './api'
export const pricingLabels = {FIXED:'قیمت ثابت', STARTING_FROM:'شروع از', RANGE:'بازه قیمت', CONSULTATION:'پس از مشاوره', VARIABLE:'قیمت متغیر'}
export const pricingType = service => service?.pricing_type || 'FIXED'
const hasAmount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
export function formatServicePrice(service) {
  switch(pricingType(service)) {
    case 'FIXED': return hasAmount(service?.price) ? toman(service.price) : 'قیمت مشخص نشده'
    case 'STARTING_FROM': return hasAmount(service.minimum_price) ? `از ${toman(service.minimum_price)}` : 'قیمت مشخص نشده'
    case 'RANGE': return hasAmount(service.minimum_price) && hasAmount(service.maximum_price) ? `${new Intl.NumberFormat('fa-IR').format(service.minimum_price)} تا ${toman(service.maximum_price)}` : 'قیمت مشخص نشده'
    case 'CONSULTATION': return 'قیمت پس از مشاوره'
    default: return hasAmount(service.minimum_price) ? `از ${toman(service.minimum_price)}` : 'قیمت متغیر'
  }
}
export function bookingPriceSummary(services) {
  const fixed = services.filter(service => pricingType(service) === 'FIXED')
  const fixedTotal = fixed.reduce((sum,service) => sum + Number(service.price || 0),0)
  const unresolved = services.length !== fixed.length
  if (!unresolved) return toman(fixedTotal)
  return `${fixed.length ? `مبلغ قطعی سرویس‌های ثابت: ${toman(fixedTotal)} · ` : ''}قیمت نهایی برخی سرویس‌ها پس از مشاوره مشخص می‌شود`
}
export function formatItemPrice(item) {
  if (item.is_price_final === false) return item.price_status === 'estimated' ? 'قیمت تقریبی؛ هنوز نهایی نشده' : 'قیمت مشخص نشده'
  return toman(item.effective_price ?? item.final_price ?? item.price_snapshot)
}
export function servicePricingPayload(form) {
  const type=pricingType(form)
  return {...form, pricing_type:type, price:type==='FIXED' ? form.price : (form.price || 0),
    minimum_price:['STARTING_FROM','RANGE','VARIABLE'].includes(type) && form.minimum_price !== '' ? (form.minimum_price ?? null) : null,
    maximum_price:type==='RANGE' && form.maximum_price !== '' ? (form.maximum_price ?? null) : null}
}
