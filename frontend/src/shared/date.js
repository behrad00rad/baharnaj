export const pad = (value) => String(value).padStart(2, '0')

const jalaliDateTimeFormatter = new Intl.DateTimeFormat(
  'fa-IR-u-ca-persian-nu-arabext',
  {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tehran',
  },
)

const jalaliDateFormatter = new Intl.DateTimeFormat(
  'fa-IR-u-ca-persian-nu-arabext',
  {
    dateStyle: 'medium',
    timeZone: 'Asia/Tehran',
  },
)

const parseDisplayDate = (value) => {
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00+03:30`)
  }
  return new Date(value)
}

export const formatJalaliDate = (value, fallback = '') => {
  if (!value) return fallback
  const date = parseDisplayDate(value)
  return Number.isNaN(date.getTime()) ? fallback : jalaliDateFormatter.format(date)
}

export const formatJalaliDateTime = (value, fallback = '') => {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : jalaliDateTimeFormatter.format(date)
}

export const formatJalaliYear = (value = new Date()) =>
  new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(parseDisplayDate(value))

export const formatJalaliDatesInText = (value) =>
  typeof value === 'string'
    ? value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => formatJalaliDate(date, date))
    : value
