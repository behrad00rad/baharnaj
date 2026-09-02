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
