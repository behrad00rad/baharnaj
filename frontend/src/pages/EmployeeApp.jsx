import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { api, toman } from '../shared/api'
import { JalaliDatePicker } from '../components/DatePicker'

const unwrap = (data) => data?.results || data || []
const statusNames = { pending: 'در انتظار', confirmed: 'تأیید شده', in_progress: 'در حال انجام', completed: 'انجام شده', cancelled: 'لغو شده' }
const errorText = (error, fallback) => { const data = error.response?.data; if (!data) return fallback; if (typeof data.detail === 'string') return data.detail; const value = Object.values(data)[0]; return Array.isArray(value) ? value.join(' ') : String(value) }
function Skeleton() { return <div className="employee-skeleton"><span /><span /><span /></div> }
function Empty({ title = 'چیزی برای نمایش نیست', text = 'اطلاعات جدید پس از ثبت در اینجا دیده می‌شود.' }) { return <div className="employee-empty"><strong>{title}</strong>{text}</div> }
function useData(endpoint) { const [state, setState] = useState({ data: [], error: '', loading: true }); const reload = () => { setState({ data: [], error: '', loading: true }); api.get(endpoint).then(({ data }) => setState({ data: unwrap(data), error: '', loading: false })).catch((error) => setState({ data: [], error: errorText(error, 'دریافت اطلاعات انجام نشد'), loading: false })) }; useEffect(reload, [endpoint]); return { ...state, reload } }
function Heading({ kicker, title }) { return <><span className="employee-kicker">{kicker}</span><h1 className="employee-page-title">{title}</h1></> }
function AppointmentCard({ item, onClick }) { const line = item.items?.[0] || item; const name = item.customer_name || item.customer?.name || 'مشتری'; return <button className={`employee-appointment ${item.status || line.completion_status || 'pending'}`} onClick={onClick}><time>{line.start_time || '--:--'}</time><i className="appt-bar" /><span><b>{name}</b><small>{line.service_name || 'خدمت رزرو شده'} · {line.end_time || ''}</small></span><em className={`employee-status ${item.status}`}>{statusNames[item.status] || item.status || 'در انتظار'}</em></button> }
function DailyWorkspace() {
  const today = isoDate(new Date())
  const appointments = useData(`employee/appointments/?date=${today}`)
  const summary = useData('employee/statistics/')
  const [selected, setSelected] = useState(null)
  const next = summary.data.next_appointment
  const nextItem = summary.data.next_appointment_item
  return (
    <div className="employee-page">
      <Heading kicker="روز کاری من" title="امروز" />
      <Link className="employee-action" to="/employee/appointments/new">+ نوبت جدید</Link>
      {summary.error || appointments.error ? <div className="schedule-message">{summary.error || appointments.error}</div> : null}
      {next ? (
        <section className="employee-card next-card">
          <span className="employee-kicker">نوبت بعدی</span>
          <h2>{next.customer_name || 'مشتری'}</h2>
          <p>{nextItem?.service_name || 'خدمت رزرو شده'} · {nextItem?.duration_snapshot || '--'} دقیقه</p>
          <strong className="next-time">{nextItem?.start_time || '--:--'}</strong>
          <div className="next-actions"><button onClick={() => setSelected(next)}>مشاهده جزئیات</button></div>
        </section>
      ) : (
        <section className="employee-card"><Empty title="نوبت بعدی ندارید" text="برنامه امروز شما خالی است." /></section>
      )}
      <div className="employee-stat-grid">
        <div className="employee-stat"><span>نوبت‌های امروز</span><strong>{summary.data.today_total || 0}</strong></div>
        <div className="employee-stat"><span>تکمیل‌شده</span><strong>{summary.data.completed_services || 0}</strong><small>{summary.data.remaining_services || 0} خدمت باقی‌مانده</small></div>
        <div className="employee-stat"><span>کمیسیون امروز</span><strong>{toman(summary.data.employee_commission || 0)}</strong></div>
      </div>
      <div className="day-label"><h2>برنامه امروز</h2><span>{summary.data.today_total || 0} نوبت</span></div>
      {appointments.loading ? <Skeleton /> : appointments.error ? null : appointments.data.length ? appointments.data.map((item) => <AppointmentCard key={item.id} item={item} onClick={() => setSelected(item)} />) : <Empty title="امروز نوبتی برای شما ثبت نشده است." />}
      {selected && <AppointmentDetail item={selected} close={() => setSelected(null)} onSaved={() => { setSelected(null); appointments.reload(); summary.reload() }} />}
    </div>
  )
}

function NewAppointment() {
  const navigate = useNavigate()
  const services = useData('employee/services/')
  const profile = useData('employee/profile/')
  const [selectedServices, setSelectedServices] = useState([])
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [customer, setCustomer] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' })
  const [date, setDate] = useState(isoDate(new Date()))
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!query.trim()) return setCustomers([])
    api.get(`employee/customers/?q=${encodeURIComponent(query)}`).then(({ data }) => setCustomers(unwrap(data))).catch(() => setCustomers([]))
  }, [query])
  useEffect(() => {
    if (!date || !selectedServices.length || !profile.data.id) return setSlots([])
    const items = selectedServices.map((service) => ({ service, employee: profile.data.id }))
    api.get(`availability/?date=${date}&items=${encodeURIComponent(JSON.stringify(items))}`).then(({ data }) => setSlots(data.slots || [])).catch(() => setSlots([]))
  }, [date, selectedServices, profile.data.id])
  const toggleService = (serviceId) => {
    setTime('')
    setSelectedServices((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId])
  }
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.post('employee/appointments/create/', {
        customer: customer?.id,
        customer_name: customer ? undefined : newCustomer.name,
        customer_phone: customer ? undefined : newCustomer.phone,
        services: selectedServices,
        date,
        start_time: time,
        notes,
      })
      navigate('/employee/calendar')
    } catch (error) {
      setMessage(errorText(error, 'در ثبت نوبت خطایی رخ داد.'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="employee-page"><Heading kicker="ثبت سریع" title="نوبت جدید" /><form className="employee-form employee-card" onSubmit={submit}><label>جستجوی مشتری<input value={query} onChange={(event) => { setQuery(event.target.value); setCustomer(null) }} placeholder="نام یا شماره تماس" /></label>{customers.map((entry) => <button className="employee-appointment" type="button" key={entry.id} onClick={() => { setCustomer(entry); setQuery(entry.name) }}><span><b>{entry.name}</b><small>{entry.phone}</small></span></button>)}{customer ? <div className="detail-notes">مشتری انتخاب‌شده: {customer.name}</div> : <><label>نام مشتری جدید<input value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} required /></label><label>شماره تماس<input type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} required /></label></>}<fieldset className="employee-service-list"><legend>خدمات من</legend>{services.loading ? <Skeleton /> : services.data.map((service) => <label key={service.id}><input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} /> {service.persian_name} · {service.duration} دقیقه</label>)}</fieldset><label>تاریخ<JalaliDatePicker value={date} onChange={(value) => { setDate(value); setTime('') }} /></label>{date && selectedServices.length ? <><span className="employee-kicker">زمان‌های آزاد</span><div className="slot-grid">{slots.map((slot) => <button className={time === slot ? 'selected' : ''} type="button" onClick={() => setTime(slot)} key={slot}>{slot}</button>)}</div>{!slots.length && <small>زمان آزادی برای این ترکیب خدمات وجود ندارد.</small>}</> : null}<label>توضیحات<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="employee-action" disabled={saving || !selectedServices.length || !time}>{saving ? 'در حال ثبت...' : 'ثبت نوبت'}</button>{message && <small className="schedule-message">{message}</small>}</form></div>
}
const isoDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(value)
const addDays = (value, amount) => { const next = new Date(`${value}T12:00:00`); next.setDate(next.getDate() + amount); return isoDate(next) }
const weekdayNumber = (value) => (new Date(`${value}T12:00:00`).getDay() + 6) % 7
function Calendar() { const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date())); const resource = useData(`employee/appointments/?date=${selectedDate}`); const schedule = useData('employee/schedule/'); const [mode, setMode] = useState('day'); const [selected, setSelected] = useState(null); const days = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3)); const workingHours = schedule.data.find((item) => item.weekday === weekdayNumber(selectedDate) && item.is_active); const selectedLabel = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`)); return <div className="employee-page"><Heading kicker="برنامه‌ریزی" title="تقویم" /><div className="calendar-toggle"><button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>روز</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>هفته</button></div><div className="calendar-navigation"><button type="button" aria-label="روز قبل" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>›</button><strong>{selectedLabel}</strong><button type="button" aria-label="روز بعد" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>‹</button></div>{mode === 'week' && <div className="week-strip">{days.map((day) => <button type="button" aria-label={`انتخاب ${day}`} className={day === selectedDate ? 'active' : ''} onClick={() => setSelectedDate(day)} key={day}>{new Intl.DateTimeFormat('fa-IR', { weekday: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`))}</button>)}</div>}<section className="employee-card"><div className="day-label"><h2>{selectedLabel}</h2><span>{schedule.loading ? 'در حال دریافت ساعات کاری...' : workingHours ? `بازه کاری ${workingHours.start_time.slice(0, 5)} تا ${workingHours.end_time.slice(0, 5)}` : 'برای این روز ساعتی ثبت نشده است'}</span></div>{resource.loading ? <Skeleton /> : resource.data.length ? resource.data.map((item) => <AppointmentCard key={item.id} item={item} onClick={() => setSelected(item)} />) : <Empty title="تقویم خالی است" text="نوبتی برای این روز پیدا نشد." />}</section>{selected && <AppointmentDetail item={selected} close={() => setSelected(null)} onSaved={() => { setSelected(null); resource.reload() }} />}</div> }
function CalendarWorkspace() {
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()))
  const [mode, setMode] = useState('day')
  const [selected, setSelected] = useState(null)
  const weekStart = addDays(selectedDate, -weekdayNumber(selectedDate))
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const endpoint = mode === 'week'
    ? `employee/appointments/?start=${weekStart}&end=${weekDays[6]}`
    : `employee/appointments/?date=${selectedDate}`
  const appointments = useData(endpoint)
  const step = mode === 'week' ? 7 : 1
  const displayDays = mode === 'week' ? weekDays : [selectedDate]

  return (
    <div className="employee-page">
      <Heading kicker="برنامه‌ریزی" title="تقویم" />
      <div className="calendar-toggle">
        <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>روز</button>
        <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>هفته</button>
      </div>
      <div className="calendar-navigation">
        <button type="button" aria-label="بازه قبل" onClick={() => setSelectedDate(addDays(selectedDate, -step))}>›</button>
        <strong>{mode === 'week' ? `${weekStart} تا ${weekDays[6]}` : new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}</strong>
        <button type="button" aria-label="بازه بعد" onClick={() => setSelectedDate(addDays(selectedDate, step))}>‹</button>
      </div>
      {appointments.loading ? <Skeleton /> : appointments.error ? <div className="schedule-message">{appointments.error}</div> : displayDays.map((day) => {
        const dayAppointments = appointments.data.filter((appointment) => appointment.items?.some((item) => item.date === day))
        const label = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`))
        return <section className="calendar-day" key={day}><div className="day-label"><h2>{label}</h2><span>{dayAppointments.length} نوبت</span></div>{dayAppointments.length ? dayAppointments.map((appointment) => <AppointmentCard key={appointment.id} item={appointment} onClick={() => setSelected(appointment)} />) : <Empty title="برای این روز نوبتی ندارید" text="" />}</section>
      })}
      {selected && <AppointmentDetail item={selected} close={() => setSelected(null)} onSaved={() => { setSelected(null); appointments.reload() }} />}
    </div>
  )
}

function Availability() {
  const timeOff = useData('employee/time-off/')
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.post('employee/time-off/', form)
      setForm({ start_date: '', end_date: '', reason: '' })
      setMessage('مرخصی ثبت شد.')
      timeOff.reload()
    } catch (error) {
      setMessage(errorText(error, 'ثبت مرخصی انجام نشد'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="employee-page"><Heading kicker="برنامه کاری" title="دسترسی و مرخصی" /><WeeklyScheduleEditor /><section className="employee-card"><h2>ثبت مرخصی</h2><form className="employee-form" onSubmit={submit}><label>از<input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required /></label><label>تا<input type="date" min={form.start_date} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} required /></label><label>دلیل<textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><button className="employee-action" disabled={saving}>{saving ? 'در حال ثبت...' : 'ثبت مرخصی'}</button>{message && <small className="schedule-message">{message}</small>}</form></section><section className="employee-card"><h2>مرخصی‌های ثبت‌شده</h2>{timeOff.loading ? <Skeleton /> : timeOff.error ? <small className="schedule-message">{timeOff.error}</small> : timeOff.data.length ? timeOff.data.map((entry) => <div className="time-off-row" key={entry.id}><b>{entry.start_date} تا {entry.end_date}</b><small>{entry.reason || 'بدون توضیح'}</small></div>) : <Empty title="مرخصی ثبت نشده است" text="" />}</section></div>
}

const paymentStatusNames = { pending: 'در انتظار تأیید', paid: 'تأیید شده', failed: 'رد شده', refunded: 'بازپرداخت شده' }
const paymentMethodNames = { cash: 'نقدی', card: 'کارت', bank_transfer: 'انتقال بانکی', online: 'آنلاین', other: 'سایر' }

function PaymentReport({ appointmentId }) {
  const history = useData(`employee/appointments/${appointmentId}/payments/`)
  const [form, setForm] = useState({ amount: '', payment_method: 'cash', notes: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!form.amount && history.data.remaining_total) {
      setForm((current) => ({ ...current, amount: String(history.data.remaining_total) }))
    }
  }, [form.amount, history.data.remaining_total])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.post(`employee/appointments/${appointmentId}/payments/`, { ...form, amount: Number(form.amount) })
      setForm({ amount: '', payment_method: 'cash', notes: '' })
      setMessage('گزارش پرداخت برای تأیید مدیریت ثبت شد.')
      history.reload()
    } catch (error) {
      setMessage(errorText(error, 'خطا در ثبت پرداخت'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="employee-card"><h2>پرداخت نوبت</h2>{history.loading ? <Skeleton /> : history.error ? <small className="schedule-message">{history.error}</small> : <><div className="detail-info"><div><span>پرداخت‌شده</span><b>{toman(history.data.paid_total)}</b></div><div><span>مانده قابل پرداخت</span><b>{toman(history.data.remaining_total)}</b></div></div><form className="employee-form" onSubmit={submit}><label>مبلغ<input type="number" min="1" max={history.data.remaining_total} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label><label>روش پرداخت<select value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })}>{Object.entries(paymentMethodNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>یادداشت اختیاری<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="employee-action" disabled={saving || !history.data.remaining_total}>{saving ? 'در حال ثبت...' : 'ثبت پرداخت'}</button>{message && <small className="schedule-message">{message}</small>}</form><div className="payment-history">{history.data.payments?.map((payment) => <div className="time-off-row" key={payment.id}><b>{toman(payment.amount)} · {paymentMethodNames[payment.payment_method]}</b><small>{paymentStatusNames[payment.status] || payment.status} · {payment.reporter_name || 'مدیریت'}</small></div>)}</div></>}</section>
}

function AppointmentDetail({ item, close, onSaved }) {
  const lines = item.items?.length ? item.items : [item]
  const [activeItemId, setActiveItemId] = useState(lines[0].id)
  const line = lines.find((entry) => entry.id === activeItemId) || lines[0]
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState(line.notes || '')
  const [showReason, setShowReason] = useState(false)
  const [actionError, setActionError] = useState('')
  const isFinal = ['completed', 'cancelled'].includes(line.completion_status)

  const chooseLine = (entry) => {
    setActiveItemId(entry.id)
    setNotes(entry.notes || '')
    setReason('')
    setShowReason(false)
    setActionError('')
  }
  const act = async (action) => {
    if (action === 'cancel' && !reason.trim()) {
      setShowReason(true)
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.post(`employee/appointment-items/${line.id}/action/`, { status: action, reason, notes })
      onSaved()
    } catch (error) {
      setActionError(errorText(error, 'ثبت وضعیت خدمت انجام نشد'))
      setBusy(false)
    }
  }

  return (
    <div className="employee-detail">
      <div className="detail-top">
        <span className="employee-kicker">جزئیات نوبت</span>
        <button className="detail-close" onClick={close}>×</button>
      </div>
      <div className="customer-head">
        <div className="customer-avatar">{(item.customer_name || 'م')[0]}</div>
        <div>
          <h2>{item.customer_name || item.customer?.name || 'مشتری'}</h2>
          <a href={`tel:${item.customer_phone || item.customer?.phone || ''}`}>
            {item.customer_phone || item.customer?.phone || 'شماره ثبت نشده'}
          </a>
        </div>
      </div>
      {lines.length > 1 && (
        <div className="calendar-toggle">
          {lines.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === line.id ? 'active' : ''}
              onClick={() => chooseLine(entry)}
            >
              {entry.service_name || `خدمت #${entry.service}`}
            </button>
          ))}
        </div>
      )}
      <div className="detail-info">
        <div><span>خدمت</span><b>{line.service_name || 'خدمت رزرو شده'}</b></div>
        <div><span>زمان</span><b>{line.start_time} تا {line.end_time}</b></div>
        <div><span>مدت</span><b>{line.duration_snapshot || '--'} دقیقه</b></div>
        <div><span>مبلغ</span><b>{toman(line.price_snapshot)}</b></div>
        <div><span>وضعیت پرداخت</span><b>{item.payment_status || 'نامشخص'}</b></div>
      </div>
      {item.notes && <div className="detail-notes">یادداشت مشتری: {item.notes}</div>}
      <PaymentReport appointmentId={item.id} />
      {isFinal ? <div className="detail-notes">این خدمت {line.completion_status === 'completed' ? 'تکمیل' : 'لغو'} شده است.</div> : <div className="detail-buttons">
        <button disabled={busy} onClick={() => act('arrival')}>تأیید حضور</button>
        <button className="secondary" disabled={busy} onClick={() => act('start')}>شروع خدمت</button>
        <button disabled={busy} onClick={() => act('complete')}>تکمیل نوبت</button>
        <button className="danger" disabled={busy} onClick={() => act('cancel')}>لغو نوبت</button>
      </div>}
      {showReason && (
        <div className="employee-form">
          <label>
            دلیل لغو الزامی است
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="employee-action" onClick={() => act('cancel')}>ثبت دلیل</button>
        </div>
      )}
      <div className="employee-card">
        <h2>یادداشت خدمات</h2>
        <textarea
          className="employee-note"
          placeholder="یادداشت‌ها و محصولات مصرف‌شده را ثبت کنید..."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      {actionError && <small className="schedule-message">{actionError}</small>}
    </div>
  )
}
function Earnings() {
  const [period, setPeriod] = useState('day')
  const resource = useData(`employee/earnings/?period=${period}`)
  const items = resource.data.items || []
  const exportCsv = () => {
    const rows = [
      ['تاریخ', 'خدمت', 'مبنای کمیسیون', 'کمیسیون', 'وضعیت کمیسیون'],
      ...items.map((item) => [item.date, item.service, item.base_amount, item.employee_commission, item.status]),
    ]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'employee-earnings.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="employee-page">
      <Heading kicker="مالی شخصی" title="درآمد" />
      <div className="calendar-toggle">
        {[['day', 'روزانه'], ['week', 'هفتگی'], ['month', 'ماهانه']].map(([value, label]) => (
          <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>
            {label}
          </button>
        ))}
      </div>
      <section className="employee-card next-card">
        <span className="employee-kicker">خدمات تکمیل‌شده</span>
        <strong className="next-time">{resource.data.completed_services || 0}</strong>
        <p>فقط خدماتی که تکمیل و ثبت شده‌اند</p>
        <span className="employee-kicker">کمیسیون من</span>
        <strong className="next-time">{toman(resource.data.employee_commission)}</strong>
        <p>بر اساس نرخ ثبت‌شده در زمان تکمیل</p>
      </section>
      <div className="day-label">
        <h2>تاریخچه کمیسیون</h2>
        <button className="employee-action" onClick={exportCsv}>خروجی CSV</button>
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : items.length ? (
        items.map((item) => (
          <div className="earning-row" key={item.id}>
            <span>
              <b>{item.service}</b>
              <small>{item.date} · وضعیت: {item.status} · پرداخت نوبت: {item.payment_status}</small>
            </span>
            <em>{toman(item.base_amount)}</em>
            <strong>{toman(item.employee_commission)}</strong>
          </div>
        ))
      ) : (
        <Empty title="هنوز کمیسیونی ثبت نشده" />
      )}
    </div>
  )
}
const weekdays = ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه', 'یکشنبه']
function WeeklyScheduleEditor() { const schedule = useData('employee/schedule/'); const [entries, setEntries] = useState([]); const [message, setMessage] = useState(''); useEffect(() => { if (!schedule.loading) setEntries(weekdays.map((label, weekday) => { const entry = schedule.data.find((item) => item.weekday === weekday); return { id: entry?.id, weekday, label, start_time: entry?.start_time?.slice(0, 5) || '09:00', end_time: entry?.end_time?.slice(0, 5) || '17:00', is_active: entry?.is_active ?? false } })) }, [schedule.data, schedule.loading]); const change = (weekday, field, value) => setEntries(entries.map((entry) => entry.weekday === weekday ? { ...entry, [field]: value } : entry)); const save = async (entry) => { setMessage(''); const payload = { weekday: entry.weekday, start_time: entry.start_time, end_time: entry.end_time, is_active: entry.is_active }; try { if (entry.id) await api.patch(`employee/schedule/${entry.id}/`, payload); else await api.post('employee/schedule/', payload); setMessage('ساعات کاری ذخیره شد'); schedule.reload() } catch { setMessage('ذخیره ساعات کاری انجام نشد') } }; return <section className="employee-card"><h2>ساعات کاری من</h2>{schedule.loading ? <Skeleton /> : <div className="weekly-schedule">{entries.map((entry) => <div className="weekly-schedule-row" key={entry.weekday}><strong>{entry.label}</strong><label>شروع<input aria-label={`شروع ${entry.label}`} type="time" value={entry.start_time} onChange={(event) => change(entry.weekday, 'start_time', event.target.value)} /></label><label>پایان<input aria-label={`پایان ${entry.label}`} type="time" value={entry.end_time} onChange={(event) => change(entry.weekday, 'end_time', event.target.value)} /></label><label className="schedule-toggle"><input aria-label={`فعال ${entry.label}`} type="checkbox" checked={entry.is_active} onChange={(event) => change(entry.weekday, 'is_active', event.target.checked)} /><span>فعال</span></label><button className="employee-action" type="button" onClick={() => save(entry)}>ذخیره</button></div>)}</div>}{message && <small className="schedule-message">{message}</small>}</section> }
function Profile() { const profile = useData('employee/profile/'); const [form, setForm] = useState({}); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false); const [passwords, setPasswords] = useState({ current_password: '', new_password: '', new_password_confirm: '' }); const [passwordMessage, setPasswordMessage] = useState(''); const [passwordSaving, setPasswordSaving] = useState(false); const save = async (event) => { event.preventDefault(); if (saving) return; setSaving(true); setMessage(''); const body = new FormData(); if (form.bio !== undefined) body.append('bio', form.bio); if (form.profile_photo instanceof File) body.append('profile_photo', form.profile_photo); try { await api.patch('employee/profile/', body); setMessage('پروفایل ذخیره شد'); setForm({}); profile.reload() } catch (error) { setMessage(errorText(error, 'ذخیره انجام نشد')) } finally { setSaving(false) } }; const changePassword = async (event) => { event.preventDefault(); if (passwordSaving) return; setPasswordSaving(true); setPasswordMessage(''); try { await api.post('employee/password/', passwords); setPasswordMessage('رمز عبور با موفقیت تغییر کرد.'); setPasswords({ current_password: '', new_password: '', new_password_confirm: '' }) } catch (error) { setPasswordMessage(errorText(error, 'تغییر رمز عبور انجام نشد')) } finally { setPasswordSaving(false) } }; return <div className="employee-page"><Heading kicker="حساب کاربری" title="پروفایل و دسترسی" /><section className="employee-card"><form className="employee-form" onSubmit={save}><label>نام نمایشی<input value={profile.data.name || ''} readOnly /></label><label>معرفی کوتاه<textarea value={form.bio ?? profile.data.bio ?? ''} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><label>تصویر پروفایل<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setForm({ ...form, profile_photo: event.target.files[0] })} /></label><button className="employee-action" type="submit" disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</button>{message && <small>{message}</small>}</form></section><section className="employee-card"><h2>تغییر رمز عبور</h2><form className="employee-form" onSubmit={changePassword}><label>رمز عبور فعلی<input type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} required /></label><label>رمز عبور جدید<input type="password" autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} required /></label><label>تکرار رمز عبور جدید<input type="password" autoComplete="new-password" value={passwords.new_password_confirm} onChange={(event) => setPasswords({ ...passwords, new_password_confirm: event.target.value })} required /></label><button className="employee-action" type="submit" disabled={passwordSaving}>{passwordSaving ? 'در حال ذخیره...' : 'تغییر رمز عبور'}</button>{passwordMessage && <small>{passwordMessage}</small>}</form></section><Link className="employee-action" to="/employee/availability">مدیریت برنامه کاری</Link></div> }
export default function EmployeeApp() { return <Routes><Route index element={<DailyWorkspace />} /><Route path="appointments/new" element={<NewAppointment />} /><Route path="calendar" element={<CalendarWorkspace />} /><Route path="earnings" element={<Earnings />} /><Route path="availability" element={<Availability />} /><Route path="profile" element={<Profile />} /><Route path="*" element={<DailyWorkspace />} /></Routes> }
