import { Link } from 'react-router-dom'
import { ServiceGrid } from '../components/ServiceGrid'
import { useServices } from '../shared/hooks'

const gallery = [
  ['https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=85', 'آیین آرامش'],
  ['https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=700&q=85', 'جزئیات ظریف'],
  ['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=85', 'رنگ و درخشش'],
]

export default function Home() {
  const { services } = useServices()
  return <>
    <section className="hero editorial-hero container"><div className="hero-copy"><p className="eyebrow">استودیو زیبایی بهارناژ · تهران</p><h1>زیبایی،<br /><em>به سبک تو.</em></h1><p className="lead">جایی برای مکث کردن، تازه شدن و دوباره عاشق خودت شدن.</p><Link className="button" to="/book">شروع تجربه <span>←</span></Link></div><div className="hero-art"><div className="image-frame"><img src={gallery[0][0]} alt="فضای آرام استودیو بهارناژ" fetchPriority="high" /></div><div className="round-note">آرامش<br />در هر لمس</div><div className="vertical-label">BEAUTY · CARE · RITUAL</div></div></section>
    <section className="intro identity container"><p className="eyebrow">یک آیین کوچک برای خودت</p><h2>هر روز، کمی <em>بیشتر</em><br />خودت باش.</h2><p>ما باور داریم زیبایی از لحظه‌ای شروع می‌شود که برای خودت وقت می‌گذاری. در بهارناژ، هر خدمت با دقت، آرامش و عشق انجام می‌شود.</p></section>
    <section className="home-band"><div className="container home-band-inner"><div><p className="eyebrow">انتخاب سردبیر</p><h2>خدماتی برای<br /><em>درخشش تو.</em></h2></div><Link to="/services">دیدن همه خدمات ←</Link></div><ServiceGrid services={services.slice(0, 3)} /></section>
    <section className="specialists container"><div className="section-heading"><div><p className="eyebrow">دست‌های مطمئن</p><h2>متخصصان ما</h2></div><span>هر تجربه، با امضای یک هنرمند</span></div><div className="specialist-grid"><article><div className="specialist-image"><img src={gallery[1][0]} alt="متخصص بهارناژ" loading="lazy" /></div><h3>مریم احمدی</h3><p>رنگ و احیای مو</p></article><article><div className="specialist-image"><img src={gallery[2][0]} alt="متخصص بهارناژ" loading="lazy" /></div><h3>سارا رضایی</h3><p>کوتاهی و استایل</p></article><article><div className="specialist-image initials">ن</div><h3>نیلوفر کریمی</h3><p>مانیکور و مراقبت ناخن</p></article></div></section>
    <section className="home-gallery container"><div className="section-heading"><div><p className="eyebrow">لحظه‌های بهارناژ</p><h2>در قاب ما</h2></div><Link to="/gallery">گالری کامل ←</Link></div><div className="home-gallery-grid">{gallery.map(([src, title]) => <Link to="/gallery" key={src}><img src={src} alt={title} loading="lazy" srcSet={`${src}&w=500 500w, ${src}&w=900 900w`} sizes="(max-width: 700px) 90vw, 33vw" /><span>{title}</span></Link>)}</div></section>
    <section className="testimonial container"><p className="eyebrow">از زبان شما</p><blockquote>«بهارناژ فقط یک سالن نیست؛ چند ساعت آرامش است که با خودت به خانه می‌بری.»</blockquote><span>مریم · مشتری بهارناژ</span></section>
    <section className="home-cta"><div className="container"><p className="eyebrow">آماده یک تغییر کوچک؟</p><h2>وقت خودت را<br /><em>رزرو کن.</em></h2><Link className="button" to="/book">رزرو نوبت <span>←</span></Link></div></section>
    <section className="location container"><div><p className="eyebrow">منتظرت هستیم</p><h2>در قلب تهران</h2><p>خیابان ولیعصر، کوچه نهم<br />شنبه تا پنجشنبه · ۹ تا ۲۰</p></div><a className="location-link" href="https://maps.google.com/?q=Tehran" target="_blank" rel="noreferrer">باز کردن نقشه ↗</a></section>
  </>
}
