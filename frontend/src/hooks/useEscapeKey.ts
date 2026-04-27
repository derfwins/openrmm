import { useEffect } from 'react'

/**
 * Call handler when Escape is pressed. Useful for closing modals.
 */
export function useEscapeKey(handler: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler, active])
}