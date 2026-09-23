import http, { createServer } from 'node:http'
import https from 'node:https'
import { readFile } from 'node:fs/promises'
import { render } from './dist/server/entry-server.js'
const template = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8')
const base = new URL(process.env.SSR_API_BASE_URL || 'http://127.0.0.1:8000/api/v1/')
const publicOrigin = new URL(process.env.SSR_PUBLIC_ORIGIN || 'https://baharnaj.ir')
const cache = new Map(), ttl = 300000, max = 200
const routes = new Set(['/', '/services', '/blog', '/gallery', '/team', '/about', '/contact', '/book', '/privacy', '/terms'])
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const json = (v) => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`)
async function get(endpoint) {
  const url = new URL(endpoint, base)
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw Error('Invalid API URL')
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.get(url, { headers: {
      Accept: 'application/json',
      Host: publicOrigin.host,
      'X-Forwarded-Host': publicOrigin.host,
      'X-Forwarded-Proto': publicOrigin.protocol.slice(0, -1),
    } }, (response) => {
      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > 10 * 1024 * 1024) request.destroy(Error('Public API response is too large'))
        else chunks.push(chunk)
      })
      response.on('end', () => {
        if (response.statusCode === 404) { resolve(null); return }
        if (response.statusCode < 200 || response.statusCode >= 300) { reject(Error(`API ${response.statusCode}: ${endpoint}`)); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch (error) { reject(error) }
      })
    })
    request.setTimeout(8000, () => request.destroy(Error(`Public API timeout: ${endpoint}`)))
    request.on('error', reject)
  })
}
async function load(path, search) {
  const data = {}, add = async e => {data[e] = await get(e)}
  if (path === '/') await Promise.all(['services/','gallery/','employees/','blog/posts/?page_size=3'].map(add))
  else if (path === '/services' || path === '/book') await add('services/')
  else if (path.startsWith('/services/')) {
    const slug = path.slice(10)
    if (!/^[\w-]+$/.test(slug)) return { data, notFound: true }
    const e = `services/${slug}/`; await add(e)
    if (!data[e]) return { data, notFound: true }
    await Promise.all([add('services/'),add(`blog/posts/?service=${data[e].id}&page_size=3`)])
  } else if (path === '/blog') {
    const category = new URLSearchParams(search).get('category')
    await Promise.all([add(`blog/posts/${category ? `?category=${encodeURIComponent(category)}` : ''}`),add('blog/categories/')])
  } else if (path.startsWith('/blog/')) {
    const slug = path.slice(6)
    if (!/^[\w-]+$/.test(slug)) return { data, notFound: true }
    const e = `blog/posts/${slug}/`; await add(e)
    if (!data[e]) return { data, notFound: true }
  } else if (path === '/gallery') await Promise.all([add('gallery/'),add('gallery/categories/')])
  else if (path === '/team') await add('employees/')
  return { data, notFound: false }
}
function head(seo) {
  if (!seo) throw Error('Missing SEO metadata')
  return `<title>${esc(seo.title)}</title>` + seo.tags.map(([tag,key,attrs]) => `<${tag} data-baharnaj-seo="${key}"${Object.entries(attrs).filter(([k,v])=>k!=='text'&&v!=null&&v!=='').map(([k,v])=>` ${k}="${esc(v)}"`).join('')}>${tag==='script'?attrs.text+'</script>':''}`).join('')
}
const plain = (title, body='') => template.replace('<!--ssr-head-->',`<title>${title}</title><meta name="robots" content="noindex, nofollow">`).replace('<!--ssr-outlet-->',body).replace('<!--ssr-data-->','')
const send = (res,status,html,cacheable=false) => {res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':cacheable?'public, max-age=0, must-revalidate':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(html)}
createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost')
    if (url.pathname==='/healthz') {res.writeHead(200);res.end('ok');return}
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return}
    const path = url.pathname.replace(/\/$/,'')||'/'
    if (!routes.has(path)&&!path.startsWith('/services/')&&!path.startsWith('/blog/')) {send(res,200,plain('بهارناژ'));return}
    const privateRequest = Boolean(req.headers.cookie||req.headers.authorization)||path==='/book'
    const key = path+(path==='/blog'?url.search:'')
    const hit = !privateRequest&&cache.get(key)
    if (hit&&hit.expires>Date.now()) {send(res,200,hit.html,true);return}
    const { data, notFound } = await load(path,url.search)
    const rendered = render(path+url.search,data)
    const html = template.replace('<!--ssr-head-->',head(rendered.seo)).replace('<!--ssr-outlet-->',rendered.html).replace('<!--ssr-data-->',`<script>window.__BAHARNAJ_DATA__=${json(data)}</script>`)
    if (!privateRequest && !notFound) {cache.delete(key);cache.set(key,{html,expires:Date.now()+ttl});if(cache.size>max)cache.delete(cache.keys().next().value)}
    send(res,notFound ? 404 : 200,html,!privateRequest && !notFound)
  } catch(e) {console.error('SSR failed:',e);send(res,503,plain('بهارناژ'))}
}).listen(Number(process.env.SSR_PORT||3000),'0.0.0.0')
