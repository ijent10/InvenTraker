"use client"

import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react"

type ToastMessage = { id: string; message: string }

type ToastContextShape = {
  push: (message: string) => void
}

const ToastContext = createContext<ToastContextShape | null>(null)

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const push = useCallback((message: string) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 2600)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3 text-sm shadow-[var(--app-shadow)]">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside ToastProvider")
  return context
}
