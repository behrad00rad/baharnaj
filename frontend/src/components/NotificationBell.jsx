import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../shared/api'
import { disableCurrentPushSubscription } from '../shared/push'
import './Notifications.css'

const toUint8Array = (value) => {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const subscriptionPayload = (subscription) => {
  const json = subscription.toJSON()
  return { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }
}

function PushPermissionButton() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [state, setState] = useState(supported ? Notification.permission : 'unsupported')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supported || Notification.permission !== 'granted') return
    navigator.serviceWorker.getRegistration('/service-worker.js').then((registration) => registration?.pushManager.getSubscription()).then((subscription) => {
      setState(subscription ? 'enabled' : 'granted')
    }).catch(() => {})
  }, [supported])

  const enable = async () => {
    setMessage('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission)
        setMessage(permission === 'denied' ? 'اجازه اعلان در مرورگر مسدود شده است.' : 'فعال‌سازی اعلان لغو شد.')
        return
      }
      const { data } = await api.get('push-subscriptions/')
      if (!data.configured || !data.public_key) throw new Error('not-configured')
      const registration = await navigator.serviceWorker.register('/service-worker.js')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8Array(data.public_key) })
      await api.post('push-subscriptions/', subscriptionPayload(subscription))
      setState('enabled')
      setMessage('اعلان‌های این دستگاه فعال شد.')
    } catch {
      setMessage('فعال‌سازی اعلان در حال حاضر ممکن نیست.')
    }
  }

  const disable = async () => {
    await disableCurrentPushSubscription()
    setState('granted')
    setMessage('اعلان‌های این دستگاه غیرفعال شد.')
  }

  if (!supported) return <small className="push-message">مرورگر شما از اعلان Push پشتیبانی نمی‌کند.</small>
  const statusMessage = message || (state === 'denied' ? 'اجازه اعلان در تنظیمات مرورگر مسدود شده است.' : '')
  return <div className="push-setting"><span>اعلان‌های مرورگر: {state === 'enabled' ? 'فعال' : 'غیرفعال'}</span><button type="button" onClick={state === 'enabled' ? disable : enable} disabled={state === 'denied'}>{state === 'enabled' ? 'غیرفعال‌سازی' : 'فعال‌سازی اعلان‌ها'}</button>{statusMessage && <small className="push-message">{statusMessage}</small>}</div>
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const root = useRef(null)

  const refreshCount = useCallback(() => api.get('notifications/unread-count/').then(({ data }) => setUnread(data.count)).catch(() => {}), [])
  const refreshList = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get('notifications/')
      setNotifications((data.results || data).slice(0, 12))
    } catch { setError('دریافت اعلان‌ها ممکن نیست.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refreshCount()
    const timer = window.setInterval(refreshCount, 45000)
    return () => window.clearInterval(timer)
  }, [refreshCount])
  useEffect(() => {
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const select = async (notification) => {
    if (!notification.is_read) {
      await api.post(`notifications/${notification.id}/read/`).catch(() => {})
      setUnread((value) => Math.max(0, value - 1))
    }
    setOpen(false)
    if (notification.target_url?.startsWith('/')) navigate(notification.target_url)
  }
  const readAll = async () => {
    try {
      await api.post('notifications/read-all/')
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })))
      setUnread(0)
    } catch { setError('به‌روزرسانی اعلان‌ها ممکن نیست.') }
  }
  const date = (value) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

  const toggle = () => {
    if (!open) refreshList()
    setOpen((value) => !value)
  }
  return <div className="notification-root" ref={root}><button className="notification-bell" type="button" title="اعلان‌ها" aria-label={`اعلان‌ها، ${unread} خوانده‌نشده`} aria-expanded={open} onClick={toggle}>◔{unread > 0 && <b>{unread > 99 ? '۹۹+' : unread.toLocaleString('fa-IR')}</b>}</button>{open && <section className="notification-panel"><header><strong>اعلان‌ها</strong>{unread > 0 && <button type="button" onClick={readAll}>خواندن همه</button>}</header><div className="notification-list">{loading && <p>در حال دریافت…</p>}{error && <p className="notification-error">{error}</p>}{!loading && !error && !notifications.length && <p>اعلان تازه‌ای ندارید.</p>}{notifications.map((item) => <button type="button" className={item.is_read ? '' : 'unread'} onClick={() => select(item)} key={item.id}><strong>{item.title}</strong><span>{item.message}</span><time>{date(item.created_at)}</time></button>)}</div><PushPermissionButton /></section>}</div>
}
