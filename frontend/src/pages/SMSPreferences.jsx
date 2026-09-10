import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../shared/api';
import { SEO } from '../components/SEO';

export default function SMSPreferences() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState(''), [busy,setBusy] = useState(false), [done,setDone] = useState(false);
  const stop = async () => {setBusy(true);try {const r=await api.post('sms/opt-out/',{token:params.get('token')});setMessage(r.data.detail);setDone(true);}catch{setMessage('لینک معتبر نیست یا ارتباط برقرار نشد؛ دوباره تلاش کنید یا با سالن تماس بگیرید.');}finally{setBusy(false);}};
  return <main className="container legal-page" dir="rtl"><SEO title="ترجیحات پیامک | بهارناژ" description="مدیریت دریافت پیامک تبلیغاتی" canonicalPath="/sms/preferences" noindex/><section><h1>دریافت پیامک تبلیغاتی</h1><p>با تأیید، پیامک‌های تبلیغاتی و وفادارسازی برای شما غیرفعال می‌شوند. پیام‌های مربوط به نوبت شما جدا هستند.</p><button className="button button-primary" disabled={busy || done || !params.get('token')} onClick={stop}>تأیید لغو پیامک تبلیغاتی</button><p role="status">{message}</p></section></main>;
}
