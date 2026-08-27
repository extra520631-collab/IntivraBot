import { createContext, useContext, useCallback, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../lib/cn'

const ToastContext = createContext(null)

const toneMap = {
  success: { icon: CheckCircle2, ring: 'text-green-600', bar: 'bg-green-500' },
  error: { icon: AlertCircle, ring: 'text-red-600', bar: 'bg-red-500' },
  info: { icon: Info, ring: 'text-brand-600', bar: 'bg-brand-500' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (message, { type = 'success', duration = 3500 } = {}) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t, { id, message, type }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss]
  )

  const value = useMemo(
    () => ({
      toast,
      success: (m, o) => toast(m, { ...o, type: 'success' }),
      error: (m, o) => toast(m, { ...o, type: 'error' }),
      info: (m, o) => toast(m, { ...o, type: 'info' }),
      dismiss,
    }),
    [toast, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toaster */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {toasts.map((t) => {
          const { icon: Icon, ring, bar } = toneMap[t.type] || toneMap.info
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto animate-pop overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft"
            >
              <div className="flex items-start gap-3 p-3.5">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ring)} />
                <p className="flex-1 text-sm font-medium text-ink-800">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className={cn('h-1', bar)} />
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
