import { useSyncExternalStore } from 'react'

let accessToken = null
let role = null
let ready = false
const listeners = new Set()

const notify = () => listeners.forEach((listener) => listener())
export const getAccessToken = () => accessToken
export const getRole = () => role
export const setSession = (token, nextRole) => { accessToken = token; role = nextRole || null; notify() }
export const clearSessionState = () => { accessToken = null; role = null; notify() }
export const markAuthReady = () => { ready = true; notify() }
export const useAuth = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => ({ accessToken, role, ready }))
