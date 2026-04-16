import { useEffect } from 'react'

const KeyboardShortcuts = () => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Ctrl+K → open QuickActions
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-quick-actions'))
        return
      }

      // Escape → close modals
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('close-modal'))
        return
      }

      // / → focus search (only when not in input)
      if (e.key === '/' && !isInput) {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return null
}

export default KeyboardShortcuts