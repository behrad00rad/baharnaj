import {useState} from 'react'
import {api} from '../shared/api'
import {formatItemPrice, formatServicePrice, pricingLabels} from '../shared/pricing'
import './Pricing.css'
export default function ItemPricing({item, role, onSaved}) {
  const [price,setPrice]=useState(item.final_price ?? '')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const type=item.pricing_type || 'FIXED'
  const editable=!item.discount_applied && type!=='FIXED' && !['completed','cancelled'].includes(item.completion_status)
  const save=async()=>{
    if(price==='' || !Number.isInteger(Number(price)) || Number(price)<0) {setMessage('مبلغ معتبر وارد کنید.');return}
    setBusy(true);setMessage('')
    try {await api.post(`${role}/appointment-items/${item.id}/final-price/`,{final_price:Number(price)});onSaved()}
    catch(error){const detail=error.response?.data?.detail || error.response?.data;setMessage(typeof detail==='string'?detail:Array.isArray(detail)?detail.join(' '):'ذخیره قیمت انجام نشد.')}
    finally{setBusy(false)}
  }
  return <section className="item-pricing" aria-label="قیمت سرویس">
    <span>{pricingLabels[type]}</span>
    {type!=='FIXED' && <small>قیمت اعلام‌شده: {formatServicePrice(item.catalog_pricing_snapshot || {})}</small>}
    <strong>{item.is_price_final===false ? formatItemPrice(item) : `قیمت نهایی: ${formatItemPrice(item)}`}</strong>
    {item.discount_applied && <small>تخفیف هدیه ثبت‌شده: {new Intl.NumberFormat('fa-IR').format(item.discount_amount)} تومان</small>}
    {editable && <div className="item-price-editor"><label>قیمت نهایی توافق‌شده (تومان)<input type="number" min="0" value={price} onChange={event=>setPrice(event.target.value)} /></label><button type="button" disabled={busy} onClick={save}>{busy?'در حال ذخیره…':'ذخیره قیمت'}</button></div>}
    {message && <p role="alert">{message}</p>}
  </section>
}
