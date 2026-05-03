import { Search } from "lucide-react"

export function SearchInput({ value, onChange, placeholder = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-[14px] border border-[color:var(--app-border)] bg-[color:var(--app-control-bg)] px-3">
      <Search className="h-4 w-4 text-[color:var(--app-muted)]" />
      <input
        className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--app-muted)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
