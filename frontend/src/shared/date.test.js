import { describe, expect, it } from 'vitest'
import { formatJalaliDate, formatJalaliDateTime, formatJalaliDatesInText, formatJalaliYear } from './date'

describe('formatJalaliDateTime', () => {
  it('formats server timestamps with the Persian calendar in Tehran time', () => {
    expect(formatJalaliDateTime('2026-03-21T06:30:00Z')).toBe(
      '۱ فروردین ۱۴۰۵، ۱۰:۰۰',
    )
  })

  it('uses the supplied fallback for missing or invalid values', () => {
    expect(formatJalaliDateTime(null, 'نامشخص')).toBe('نامشخص')
    expect(formatJalaliDateTime('invalid', 'نامشخص')).toBe('نامشخص')
  })

  it('formats date-only API values without shifting their calendar day', () => {
    expect(formatJalaliDate('2026-03-21')).toBe('۱ فروردین ۱۴۰۵')
  })

  it('converts ISO dates embedded in human-readable backend text', () => {
    expect(formatJalaliDatesInText('نوبت 2026-03-21 ثبت شد.')).toBe(
      'نوبت ۱ فروردین ۱۴۰۵ ثبت شد.',
    )
  })

  it('returns the current calendar year in Jalali form', () => {
    expect(formatJalaliYear('2026-03-21')).toBe('۱۴۰۵')
  })
})
