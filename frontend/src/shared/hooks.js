import { useEffect, useState } from 'react'
import { api } from './api'

const unwrap = (data) => data?.results || data || []

export function usePublicList(endpoint) {
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => {
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

export function useServices() {
  const [services, setServices] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => {
    api.get('services/').then(({ data }) => { setServices(unwrap(data)); setState('ready') }).catch(() => setState('error'))
  }, [])
  return { services, state }
}

export function useService(slug) {
  const [service, setService] = useState(null)
  const [state, setState] = useState('loading')
  useEffect(() => {
    let active = true
    setState('loading')
    api.get(`services/${encodeURIComponent(slug)}/`).then(({ data }) => {
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
