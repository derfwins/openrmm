export type Toast = {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

type Listener = (toasts: Toast[]) => void

const listeners = new Set<Listener>()
let toasts: Toast[] = []
let idCounter = 0

function notify() {
  listeners.forEach(l => l([...toasts]))
}

export const toast = {
  subscribe(listener: Listener) {
    listeners.add(listener)
    listener([...toasts])
    return () => { listeners.delete(listener) }
  },
  success(message: string) { addToast('success', message) },
  error(message: string) { addToast('error', message) },
  warning(message: string) { addToast('warning', message) },
  info(message: string) { addToast('info', message) },
  dismiss(id: string) {
    toasts = toasts.filter(t => t.id !== id)
    notify()
  },
}

function addToast(type: Toast['type'], message: string) {
  const id = String(++idCounter)
  toasts = [...toasts, { id, type, message }]
  notify()
  setTimeout(() => { toast.dismiss(id) }, 5000)
}