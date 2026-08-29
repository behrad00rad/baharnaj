import { beforeEach, describe, expect, it } from 'vitest'
import { applyRefreshSession } from './api'
import { clearSessionState, getAccessToken, getRole, setSession } from './auth'

describe('in-memory auth state', () => {
  beforeEach(() => clearSessionState())

  it('stores access token and one authoritative role without localStorage', () => {
    setSession('access', 'employee')
    expect(getAccessToken()).toBe('access')
    expect(getRole()).toBe('employee')
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user_role')).toBeNull()
  })

  it('preserves the backend role when refresh returns a new access token', () => {
    setSession('old-access', 'employee')

    applyRefreshSession({ access: 'new-access', role: 'admin' })

    expect(getAccessToken()).toBe('new-access')
    expect(getRole()).toBe('admin')
  })
})
