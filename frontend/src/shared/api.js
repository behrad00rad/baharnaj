import axios from 'axios'
import { clearSessionState, getAccessToken, getRole, setSession } from './auth'

export const applyRefreshSession = (payload = {}) => {
  const nextAccessToken = payload.access ?? payload.access_token
  const nextRole = payload.role ?? payload.user?.role ?? getRole()

  if (!nextAccessToken) return null

  setSession(nextAccessToken, nextRole)
  return { access: nextAccessToken, role: nextRole }
}

// One client owns API authentication and refresh behavior for every page.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1/', withCredentials: true })
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    const csrf = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='))?.split('=')[1]
    if (csrf) config.headers['X-CSRFToken'] = decodeURIComponent(csrf)
  }
  return config
})
api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config
  const isPublic = /^(services|employees|availability|appointments|gallery|auth\/)/.test(originalRequest?.url || '')
  if (error.response?.status === 401 && !isPublic && !originalRequest?._retried) {
    originalRequest._retried = true
    try {
      const { data } = await api.post('auth/token/refresh/')
      applyRefreshSession(data)
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return api(originalRequest)
    } catch {
      clearSession()
    }
  }
  return Promise.reject(error)
})

export const clearSession = () => {
  clearSessionState()
}
export const logoutSession = async () => {
  try {
    await api.post('auth/logout/')
  } finally {
    clearSessionState()
  }
}
export const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value || 0)} تومان`
export const getTokenRole = () => null
