import { Link } from 'react-router-dom'
import { ServiceGrid } from '../components/ServiceGrid'
import { useServices } from '../shared/hooks'

// Home owns only the landing-page composition; reusable service cards stay shared.
export default function Home() {
  const { services } = useServices()
  return <><section id="home" className="hero container"><div className="hero-copy"><p className="eyebrow">استودیو زیبایی بهارناژ · تهران</p><h1>زیبایی،<br /><em>به سبک تو.</em></h1><p className="lead">جایی برای مکث کردن، تازه شدن و دوباره عاشق خودت شدن.</p><Link className="button" to="/book">شروع تجربه <span>←</span></Link></div><div className="hero-art"><div className="image-frame"><img src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1000&q=85" alt="فضای آرام استودیو بهارناژ" /></div><div className="round-note">آرامش<br />در هر لمس</div><div className="vertical-label">BEAUTY · CARE · RITUAL</div></div></section><section className="intro container"><p className="eyebrow">یک آیین کوچک برای خودت</p><h2>هر روز، کمی <em>بیشتر</em><br />خودت باش.</h2><p>ما باور داریم زیبایی از لحظه‌ای شروع می‌شود که برای خودت وقت می‌گذاری. در بهارناژ، هر خدمت با دقت، آرامش و عشق انجام می‌شود.</p></section><ServiceGrid services={services.slice(0, 3)} /></>
}
