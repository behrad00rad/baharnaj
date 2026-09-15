import { Children, useState } from 'react'

// Mount infrequently used forms only when opened; avoid fetching every setting at once.
export default function TelegramDisclosure({ children, open, className = 'tg-disclosure' }) {
  const [expanded, setExpanded] = useState(Boolean(open))
  const items = Children.toArray(children)
  return <details className={className} open={open} onToggle={event => setExpanded(event.currentTarget.open)}>{items[0]}{expanded && items.slice(1)}</details>
}
