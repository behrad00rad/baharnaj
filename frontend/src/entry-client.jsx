import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './styles/theme.css'
import './index.css'
import App from './App.jsx'
import './styles/contrast.css'
import { SSRDataContext } from './shared/ssrData'
import { markAuthReady } from './shared/auth'
const root = document.getElementById('root')
const initialData = window.__BAHARNAJ_DATA__ || null
if (initialData) markAuthReady()
const app = <StrictMode><SSRDataContext.Provider value={initialData}><App /></SSRDataContext.Provider></StrictMode>
if (root.hasChildNodes() && initialData) hydrateRoot(root, app)
else createRoot(root).render(app)
