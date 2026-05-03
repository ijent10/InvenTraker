import type { PropsWithChildren, ReactNode } from "react"

export function Modal({ open, title, onClose, footer, children }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; footer?: ReactNode }>) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-6 shadow-[var(--app-shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-[color:var(--app-border)] px-2 py-1 text-xs">
            Close
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  )
}
