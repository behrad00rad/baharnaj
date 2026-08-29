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
export const galleryImageUrl = (value) => {
  if (!value || /^https?:\/\//i.test(value)) return value
  const mediaBase = import.meta.env.VITE_MEDIA_URL || new URL(api.defaults.baseURL, window.location.origin).origin
  return new URL(value, mediaBase).href
}
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  const publicEndpoint = /^(services|employees|availability|appointments|gallery)\//.test(config.url || '')
  if (token && !publicEndpoint) config.headers.Authorization = `Bearer ${token}`
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
export const fallbackServices = [
  { id: 1, persian_name: 'رنگ و احیای مو', description: 'رنگی درخشان با مراقبت عمیق و شخصی‌سازی‌شده', price: 2500000, duration: 150 },
  { id: 2, persian_name: 'کوتاهی و استایل', description: 'فرم‌دهی حرفه‌ای متناسب با چهره و سبک زندگی شما', price: 850000, duration: 60 },
  { id: 3, persian_name: 'مانیکور لوکس', description: 'مراقبت کامل از دست‌ها با جزئیات ظریف', price: 650000, duration: 75 },
]
export const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value || 0)} تومان`
export const getTokenRole = () => null
