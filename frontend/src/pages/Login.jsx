import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../shared/api'
import { setSession } from '../shared/auth'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setError('')
    try {
      await api.get('auth/csrf/')
      const { data } = await api.post('auth/token/', form)
      setSession(data.access, data.role)
      const role = data.role
      navigate(role === 'employee' ? '/employee' : '/admin', { replace: true })
    } catch (requestError) { setError(requestError.response?.data?.detail || 'اتصال به سرور برقرار نشد یا نام کاربری و رمز عبور صحیح نیست.') }
  }
  return <section className="login-page container"><div><p className="eyebrow">ورود به بهارناژ</p><h1>خوش آمدی<br /><em>دوباره.</em></h1><p>برای ورود به پنل مدیریت یا پنل متخصص، اطلاعات حساب خود را وارد کنید.</p></div><form onSubmit={submit}><label>نام کاربری<input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" /></label><label>رمز عبور<div className="password-field"><input required type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}>{showPassword ? 'مخفی' : 'نمایش'}</button></div></label>{error && <p className="error">{error}</p>}<button className="button" type="submit">ورود <span>←</span></button></form></section>
}
