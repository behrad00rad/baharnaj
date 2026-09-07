import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ThemeProvider } from './theme'
import TextSizeControl from '../components/TextSizeControl'
afterEach(() => localStorage.clear())
it('persists each text size across remount without changing dark mode', () => {
  localStorage.setItem('baharnaj-theme', 'dark')
  for (const mode of ['compact', 'normal', 'large']) {
    const view = render(<ThemeProvider><TextSizeControl /></ThemeProvider>)
    fireEvent.click(screen.getByRole('radio', {name: {compact:'کوچک', normal:'معمولی', large:'بزرگ'}[mode]}))
    expect(localStorage.getItem('baharnaj-text-size')).toBe(mode)
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.unmount()
    const restored = render(<ThemeProvider><TextSizeControl /></ThemeProvider>)
    expect(screen.getByRole('radio', {name: {compact:'کوچک', normal:'معمولی', large:'بزرگ'}[mode]})).toBeChecked()
    expect(document.documentElement.dataset.textSize).toBe(mode)
    restored.unmount()
  }
})
