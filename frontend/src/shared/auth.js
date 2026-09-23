import { useSyncExternalStore } from 'react'

let accessToken = null
let role = null
let ready = false
let snapshot = { accessToken, role, ready }
const listeners = new Set()

const notify = () => listeners.forEach((listener) => listener())
const updateSnapshot = (nextAccessToken, nextRole, nextReady) => {
	if (accessToken === nextAccessToken && role === nextRole && ready === nextReady) return
	accessToken = nextAccessToken
	role = nextRole
	ready = nextReady
	snapshot = { accessToken, role, ready }
	notify()
}
export const getAccessToken = () => accessToken
export const getRole = () => role
export const setSession = (token, nextRole) => updateSnapshot(token, nextRole || null, ready)
export const clearSessionState = () => updateSnapshot(null, null, ready)
export const markAuthReady = () => updateSnapshot(accessToken, role, true)
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
export const useAuth = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
