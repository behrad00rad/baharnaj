import { beforeEach, describe, expect, it } from 'vitest'
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
})
