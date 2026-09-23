import { useEffect, useState } from 'react'
import { api } from './api'
import { useInitialData } from './ssrData'

const unwrap = (data) => data?.results || data || []

export function usePublicList(endpoint) {
  const initial = useInitialData(endpoint)
  const [items, setItems] = useState(() => initial === undefined ? [] : unwrap(initial))
  const [state, setState] = useState(initial === undefined ? 'loading' : 'ready')
  useEffect(() => {
    if (initial !== undefined) return undefined
    let active = true
    api.get(endpoint).then(({ data }) => {
      if (!active) return
      setItems(unwrap(data))
      setState('ready')
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [endpoint])
  return { items, state }
}

export function usePublicDetail(endpoint) {
  const initial = useInitialData(endpoint)
  const [item, setItem] = useState(initial ?? null)
  const [state, setState] = useState(initial === undefined ? 'loading' : 'ready')
  useEffect(() => {
    if (initial !== undefined) return undefined
    let active = true
    setState('loading')
    api.get(endpoint).then(({ data }) => { if (active) { setItem(data); setState('ready') } }).catch((error) => { if (active) { setItem(null); setState(error.response?.status === 404 ? 'not-found' : 'error') } })
    return () => { active = false }
  }, [endpoint])
  return { item, state }
}

export function useServices() {
  const initial = useInitialData('services/')
  const [services, setServices] = useState(() => initial === undefined ? [] : unwrap(initial))
  const [state, setState] = useState(initial === undefined ? 'loading' : 'ready')
  useEffect(() => {
    if (initial !== undefined) return
    api.get('services/').then(({ data }) => { setServices(unwrap(data)); setState('ready') }).catch(() => setState('error'))
  }, [])
  return { services, state }
}

export function useService(slug) {
  const endpoint = `services/${encodeURIComponent(slug)}/`
  const initial = useInitialData(endpoint)
  const [service, setService] = useState(initial ?? null)
  const [state, setState] = useState(initial === undefined ? 'loading' : 'ready')
  useEffect(() => {
    if (initial !== undefined) return undefined
    let active = true
    setState('loading')
    api.get(endpoint).then(({ data }) => {
      if (!active) return
      setService(data)
      setState('ready')
    }).catch((error) => {
      if (!active) return
      setService(null)
      setState(error.response?.status === 404 ? 'not-found' : 'error')
    })
    return () => { active = false }
  }, [slug])
  return { service, state }
}
