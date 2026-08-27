import { toGregorian, toJalaali } from 'jalaali-js'
import { pad } from '../shared/date'

export function JalaliDatePicker({ value, onChange }) {
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const current = value ? value.split('-').map(Number) : todayIso.split('-').map(Number)
  const jalali = toJalaali(current[0], current[1], current[2])
  const years = Array.from({ length: 5 }, (_, index) => jalali.jy - 2 + index)
  const update = (part, nextValue) => {
    const next = { ...jalali, [part]: Number(nextValue) }
    const gregorian = toGregorian(next.jy, next.jm, Math.min(next.jd, next.jm <= 6 ? 31 : 30))
    const nextDate = `${gregorian.gy}-${pad(gregorian.gm)}-${pad(gregorian.gd)}`
    if (nextDate >= todayIso) onChange(nextDate)
  }
  return <div className="jalali-picker"><span>تاریخ شمسی</span><div><select aria-label="سال" value={jalali.jy} onChange={(event) => update('jy', event.target.value)}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><select aria-label="ماه" value={jalali.jm} onChange={(event) => update('jm', event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat('fa-IR').format(index + 1)}</option>)}</select><select aria-label="روز" value={jalali.jd} onChange={(event) => update('jd', event.target.value)}>{Array.from({ length: jalali.jm <= 6 ? 31 : 30 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat('fa-IR').format(index + 1)}</option>)}</select></div></div>
}

export function DateModal({ value, onChange, onClose }) { return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="date-modal" role="dialog" aria-modal="true" aria-label="انتخاب تاریخ" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><strong>انتخاب تاریخ</strong><button type="button" onClick={onClose} aria-label="بستن">×</button></div><JalaliDatePicker value={value} onChange={(date) => { onChange(date); onClose() }} /></div></div> }
