import { describe, expect, it } from 'vitest'
import { pad } from './date'

describe('Persian booking helpers', () => {
  it('pads calendar values consistently', () => {
    expect(pad(3)).toBe('03')
    expect(pad(12)).toBe('12')
  })

  it('formats Persian numbers with the Intl API', async () => {
    const { toman } = await import('./api')
    expect(toman(125000)).toContain('۱۲۵')
  })
})
