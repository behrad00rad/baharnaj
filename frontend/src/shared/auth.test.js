import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { api, applyRefreshSession, requestErrorMessage } from './api'
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

  it('preserves the active role when the refresh payload omits it', async () => {
    setSession('old-access', 'employee')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { access: 'new-access' } })

    render(React.createElement(App))

    await waitFor(() => expect(getAccessToken()).toBe('new-access'))
    expect(getRole()).toBe('employee')

    postSpy.mockRestore()
  })

  it('sends the session token with an optional-public appointment request', async () => {
    setSession('booking-access', 'customer')
    const requestInterceptor = api.interceptors.request.handlers.find((handler) => handler.fulfilled)

    const config = await requestInterceptor.fulfilled({ url: 'appointments/', method: 'post', headers: {} })

    expect(config.headers.Authorization).toBe('Bearer booking-access')
  })

  it('turns a throttled request into a clear wait message', () => {
    const message = requestErrorMessage(
      { response: { status: 429, headers: { 'retry-after': '65' }, data: {} } },
      'درخواست انجام نشد.',
    )

    expect(message).toContain('۱ دقیقه')
    expect(message).toContain('۵ ثانیه')
  })
})
