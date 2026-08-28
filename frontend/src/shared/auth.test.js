import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { clearSessionState, getAccessToken, getRole, setSession, useAuth } from './auth'

describe('in-memory auth state', () => {
  beforeEach(() => clearSessionState())

  it('stores access token and one authoritative role without localStorage', () => {
    act(() => setSession('access', 'employee'))
    expect(getAccessToken()).toBe('access')
    expect(getRole()).toBe('employee')
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user_role')).toBeNull()
  })

  it('keeps the auth snapshot stable until state changes', () => {
    const { result, rerender } = renderHook(() => useAuth())
    const initialSnapshot = result.current

    rerender()

    expect(result.current).toBe(initialSnapshot)
    act(() => setSession('access', 'employee'))
    expect(result.current).not.toBe(initialSnapshot)
  })
})
