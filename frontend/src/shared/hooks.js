import { useEffect, useState } from 'react'
import { api, fallbackServices } from './api'

export function useServices() {
  const [services, setServices] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => {
    api.get('services/').then(({ data }) => setServices(data.length ? data : fallbackServices)).catch(() => { setServices(fallbackServices); setState('error') }).finally(() => setState((current) => current === 'error' ? current : 'ready'))
  }, [])
  return { services, state }
}
