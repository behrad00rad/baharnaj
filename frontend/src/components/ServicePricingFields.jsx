import { pricingLabels, pricingType } from '../shared/pricing'
export default function ServicePricingFields({form, onChange}) {
  const mode=pricingType(form)
  return <fieldset><legend>قیمت‌گذاری</legend><div className="service-editor-grid">
    <label>نوع قیمت<select value={mode} onChange={event=>onChange('pricing_type',event.target.value)}>{Object.entries(pricingLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {mode==='FIXED' && <label>قیمت نهایی (تومان)<input required min="0" type="number" value={form.price ?? ''} onChange={event=>onChange('price',event.target.value)} /></label>}
    {['STARTING_FROM','RANGE','VARIABLE'].includes(mode) && <label>{mode==='VARIABLE'?'قیمت پایه — اختیاری (تومان)':'حداقل قیمت (تومان)'}<input required={mode!=='VARIABLE'} min="0" type="number" value={form.minimum_price ?? ''} onChange={event=>onChange('minimum_price',event.target.value)} /></label>}
    {mode==='RANGE' && <label>حداکثر قیمت (تومان)<input required min={form.minimum_price || 0} type="number" value={form.maximum_price ?? ''} onChange={event=>onChange('maximum_price',event.target.value)} /></label>}
    <label>مدت (دقیقه)<input required min="1" type="number" value={form.duration || ''} onChange={event=>onChange('duration',event.target.value)} /></label>
  </div>{mode!=='FIXED' && <label>توضیح قیمت{mode==='VARIABLE'?'':' — اختیاری'}<textarea required={mode==='VARIABLE'} value={form.pricing_note || ''} onChange={event=>onChange('pricing_note',event.target.value)} /></label>}</fieldset>
}
