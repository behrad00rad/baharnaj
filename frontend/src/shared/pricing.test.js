import {expect,it} from 'vitest'
import {formatServicePrice,bookingPriceSummary,formatItemPrice,servicePricingPayload} from './pricing'
it('formats all modes without pretending consultation is free',()=>{
 expect(formatServicePrice({price:450000})).toBe('۴۵۰٬۰۰۰ تومان')
 expect(formatServicePrice({pricing_type:'STARTING_FROM',minimum_price:2000000,price:0})).toBe('از ۲٬۰۰۰٬۰۰۰ تومان')
 expect(formatServicePrice({pricing_type:'RANGE',minimum_price:1500000,maximum_price:3000000})).toBe('۱٬۵۰۰٬۰۰۰ تا ۳٬۰۰۰٬۰۰۰ تومان')
 expect(formatServicePrice({pricing_type:'CONSULTATION',price:0})).toBe('قیمت پس از مشاوره')
 expect(formatServicePrice({pricing_type:'VARIABLE',price:0})).toBe('قیمت متغیر')
 expect(formatServicePrice({pricing_type:'VARIABLE',minimum_price:2000000})).toBe('از ۲٬۰۰۰٬۰۰۰ تومان')
})
it('shows fixed-only totals and distinguishes mixed/unresolved bookings',()=>{
 expect(bookingPriceSummary([{price:450},{price:550}])).toBe('۱٬۰۰۰ تومان')
 const variable={pricing_type:'VARIABLE',minimum_price:2000}
 expect(bookingPriceSummary([variable])).not.toContain('۰ تومان')
 expect(bookingPriceSummary([{price:450},variable])).toContain('مبلغ قطعی خدمات ثابت: ۴۵۰ تومان')
 expect(bookingPriceSummary([{price:450},variable])).not.toContain('۲٬۴۵۰')
})
it('uses agreed item prices while keeping old snapshots working',()=>{
 expect(formatItemPrice({price_snapshot:450})).toBe('۴۵۰ تومان')
 expect(formatItemPrice({price_snapshot:2000,final_price:3850})).toBe('۳٬۸۵۰ تومان')
 expect(formatItemPrice({price_snapshot:2000,is_price_final:false,price_status:'estimated'})).toContain('هنوز نهایی نشده')
 expect(servicePricingPayload({pricing_type:'CONSULTATION',minimum_price:'',maximum_price:123}).maximum_price).toBeNull()
})
