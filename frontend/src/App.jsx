import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'

const localServices = [
  { id: 1, persian_name: 'رنگ و احیای مو', description: 'رنگی درخشان با مراقبت عمیق و شخصی‌سازی‌شده', price: 2500000, duration: 150 },
  { id: 2, persian_name: 'کوتاهی و استایل', description: 'فرم‌دهی حرفه‌ای متناسب با چهره و سبک زندگی شما', price: 850000, duration: 60 },
  { id: 3, persian_name: 'مانیکور لوکس', description: 'مراقبت کامل از دست‌ها با جزئیات ظریف', price: 650000, duration: 75 },
]
const toman = (value) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`

function App() {
  const [services, setServices] = useState([])
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    axios.get('http://localhost:8000/api/v1/services/')
      .then(({ data }) => setServices(data.length ? data : localServices))
      .catch(() => setServices(localServices))
  }, [])

  const chooseService = (service) => {
    setSelected(service)
    document.querySelector('#booking').scrollIntoView({ behavior: 'smooth' })
  }

  return <main dir="rtl">
    <nav className="nav container"><a className="brand" href="#home"><span>بَ</span> بهارناژ</a><div className="links"><a href="#services">خدمات</a><a href="#story">داستان ما</a><a href="#contact">تماس</a></div><a className="nav-cta" href="#booking">رزرو نوبت <span>↗</span></a></nav>
    <section id="home" className="hero container"><div className="hero-copy"><p className="eyebrow">استودیو زیبایی بهارناژ · تهران</p><h1>زیبایی،<br /><em>به سبک تو.</em></h1><p className="lead">جایی برای مکث کردن، تازه شدن و دوباره عاشق خودت شدن.</p><a className="button" href="#booking">شروع تجربه <span>←</span></a></div><div className="hero-art"><div className="image-frame"><img src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1000&q=85" alt="فضای آرام استودیو بهارناژ" /></div><div className="round-note">آرامش<br />در هر لمس</div><div className="vertical-label">BEAUTY · CARE · RITUAL</div></div></section>
    <section id="story" className="intro container"><p className="eyebrow">یک آیین کوچک برای خودت</p><h2>هر روز، کمی <em>بیشتر</em><br />خودت باش.</h2><p>ما باور داریم زیبایی از لحظه‌ای شروع می‌شود که برای خودت وقت می‌گذاری. در بهارناژ، هر خدمت با دقت، آرامش و عشق انجام می‌شود.</p></section>
    <section id="services" className="services container"><div className="section-heading"><div><p className="eyebrow">انتخاب تو</p><h2>خدمات محبوب</h2></div><a href="#booking">مشاهده همه <span>←</span></a></div><div className="service-grid">{services.map((service) => <article className="service-card" key={service.id}><div className="service-number">۰{service.id}</div><h3>{service.persian_name}</h3><p>{service.description}</p><div className="service-meta"><span>{toman(service.price)}</span><span>{new Intl.NumberFormat('fa-IR').format(service.duration)} دقیقه</span></div><button onClick={() => chooseService(service)}>انتخاب خدمت <span>←</span></button></article>)}</div></section>
    <section id="booking" className="booking container"><div><p className="eyebrow">وقت تو، همین حالا</p><h2>نوبتت را<br /><em>رزرو کن.</em></h2><p>فرم کوتاه را پر کن تا در اولین فرصت با تو تماس بگیریم.</p></div>{submitted ? <div className="success"><span>✓</span><h3>درخواستت ثبت شد</h3><p>به‌زودی برای هماهنگی با تو تماس می‌گیریم.</p></div> : <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true) }}><label>نام و نام خانوادگی<input required placeholder="مثلاً مریم احمدی" /></label><label>شماره تماس<input required type="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label><label>خدمت مورد نظر<select required value={selected?.id || ''} onChange={(event) => setSelected(services.find((item) => item.id === Number(event.target.value)))}><option value="">انتخاب کنید</option>{services.map((item) => <option value={item.id} key={item.id}>{item.persian_name}</option>)}</select></label><button className="button" type="submit">ثبت درخواست رزرو <span>←</span></button></form>}</section>
    <footer id="contact" className="footer container"><a className="brand" href="#home"><span>بَ</span> بهارناژ</a><p>تهران، خیابان ولیعصر، کوچه نهم</p><p>شنبه تا پنجشنبه · ۹ تا ۲۰</p><a href="tel:+982112345678">۰۲۱ ۱۲۳۴ ۵۶۷۸</a></footer>
  </main>
}

export default App
