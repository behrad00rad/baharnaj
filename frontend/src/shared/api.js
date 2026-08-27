import axios from 'axios'

// One client owns API authentication and refresh behavior for every page.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1/' })
export const galleryImageUrl = (value) => {
  if (!value || /^https?:\/\//i.test(value)) return value
  const mediaBase = import.meta.env.VITE_MEDIA_URL || new URL(api.defaults.baseURL, window.location.origin).origin
  return new URL(value, mediaBase).href
}
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  const publicEndpoint = /^(services|employees|availability|appointments|gallery)\//.test(config.url || '')
  if (token && !publicEndpoint) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config
  const isPublic = /^(services|employees|availability|appointments|gallery)\//.test(originalRequest?.url || '')
  if (error.response?.status === 401 && !isPublic && !originalRequest?._retried && localStorage.getItem('refresh_token')) {
    originalRequest._retried = true
    try {
      const { data } = await axios.post(`${api.defaults.baseURL}auth/token/refresh/`, { refresh: localStorage.getItem('refresh_token') })
      localStorage.setItem('access_token', data.access)
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return api(originalRequest)
    } catch {
      clearSession()
    }
  }
  return Promise.reject(error)
})

export const clearSession = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_role')
}
export const fallbackServices = [
  { id: 1, persian_name: 'رنگ و احیای مو', description: 'رنگی درخشان با مراقبت عمیق و شخصی‌سازی‌شده', price: 2500000, duration: 150 },
  { id: 2, persian_name: 'کوتاهی و استایل', description: 'فرم‌دهی حرفه‌ای متناسب با چهره و سبک زندگی شما', price: 850000, duration: 60 },
  { id: 3, persian_name: 'مانیکور لوکس', description: 'مراقبت کامل از دست‌ها با جزئیات ظریف', price: 650000, duration: 75 },
]
export const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value || 0)} تومان`
export const getTokenRole = (token) => {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role } catch { return null }
}
