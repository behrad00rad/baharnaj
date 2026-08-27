import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PageIntro, PublicLayout } from './components/PublicLayout'
import Booking from './pages/Booking'
import Dashboard from './pages/Dashboard'
import Gallery from './pages/Gallery'
import Home from './pages/Home'
import Login from './pages/Login'
import ServiceDetail from './pages/ServiceDetail'
import Services from './pages/Services'
import About from './pages/About'
import Team from './pages/Team'
import Contact from './pages/Contact'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import './App.css'

// App is intentionally limited to routing; page behavior lives beside its page.
export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
    <Route path="/services" element={<PublicLayout><Services /></PublicLayout>} />
    <Route path="/services/:id" element={<PublicLayout><ServiceDetail /></PublicLayout>} />
    <Route path="/gallery" element={<PublicLayout><Gallery /></PublicLayout>} />
    <Route path="/book" element={<PublicLayout><Booking /></PublicLayout>} />
    <Route path="/login" element={<PublicLayout><Login /></PublicLayout>} />
    <Route path="/booking-confirmation" element={<PublicLayout><PageIntro eyebrow="رزرو" title="رزرو شما تأیید شد." text="اطلاعات نوبت شما اینجا نمایش داده می‌شود." /></PublicLayout>} />
    <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
    <Route path="/team" element={<PublicLayout><Team /></PublicLayout>} />
    <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
    <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
    <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
    <Route path="/employee/*" element={<Dashboard role="employee" />} />
    <Route path="/admin/*" element={<Dashboard role="admin" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>
}
