import { renderToString } from 'react-dom/server'
import App from './App.jsx'
import { SSRDataContext } from './shared/ssrData'
import { SEOCollectorContext } from './components/SEO'
export function render(url, initialData) {
  const collector = { current: null }
  const html = renderToString(<SSRDataContext.Provider value={initialData}><SEOCollectorContext.Provider value={collector}><App serverUrl={url} /></SEOCollectorContext.Provider></SSRDataContext.Provider>)
  return { html, seo: collector.current }
}
