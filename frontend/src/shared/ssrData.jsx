import { createContext, useContext } from 'react'

export const SSRDataContext = createContext(null)
export function useInitialData(endpoint) {
  const data = useContext(SSRDataContext)
  return data && Object.prototype.hasOwnProperty.call(data, endpoint) ? data[endpoint] : undefined
}
