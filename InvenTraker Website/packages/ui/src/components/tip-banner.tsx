import { Lightbulb } from "lucide-react"

export function TipBanner({ title = "Tip", message, accentColor }: { title?: string; message: string; accentColor: string }) {
  return (
    <div className="tip-banner rounded-2xl border p-4" style={{ borderColor: `${accentColor}66`, background: `${accentColor}14` }}>
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-4 w-4" style={{ color: accentColor }} />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[13px] text-[color:var(--app-muted)]">{message}</p>
        </div>
      </div>
    </div>
  )
}
