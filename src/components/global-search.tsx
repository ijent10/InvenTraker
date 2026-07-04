"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"

type SearchResult = {
  id: string
  title: string
  subtitle: string
  type: string
  href: string
}

export function GlobalSearch({ className = "" }: { className?: string }) {
  const router = useRouter()
  const rootRef = useRef<HTMLFormElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const trimmedQuery = query.trim()

  useEffect(() => {
    function closeSearch(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeSearch)
    return () => document.removeEventListener("mousedown", closeSearch)
  }, [])

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([])
      setLoading(false)
      setError("")
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal
        })
        const payload = (await response.json()) as { results?: SearchResult[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "Search failed.")
        setResults(payload.results ?? [])
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        setResults([])
        setError(caughtError instanceof Error ? caughtError.message : "Search failed.")
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [trimmedQuery])

  function openResult(result: SearchResult) {
    setOpen(false)
    setQuery("")
    router.push(result.href)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const firstResult = results[0]
    if (firstResult) openResult(firstResult)
  }

  return (
    <form
      ref={rootRef}
      onSubmit={submitSearch}
      className={`relative h-10 min-w-0 items-center gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 text-sm text-[var(--app-muted)] ${className}`}
    >
      <Search className="h-4 w-4 shrink-0" />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const firstResult = results[0]
            if (firstResult) {
              event.preventDefault()
              openResult(firstResult)
            }
          }
          if (event.key === "Escape") setOpen(false)
        }}
        className="w-full bg-transparent text-[var(--app-control-text)] outline-none placeholder:text-[var(--app-subtle)]"
        placeholder="Search items, orders, vendors"
        aria-label="Search workspace"
      />
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--app-subtle)]" /> : null}

      {open && trimmedQuery ? (
        <div className="absolute left-0 top-12 z-50 w-full min-w-0 overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] shadow-2xl shadow-black/30 sm:w-[420px]">
          {error ? (
            <p className="px-4 py-3 text-sm font-semibold text-rose-300">{error}</p>
          ) : results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto py-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => openResult(result)}
                  className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-[var(--app-control-bg-hover)]"
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate font-semibold text-[var(--app-text)]">{result.title}</span>
                    <span className="shrink-0 rounded-md border border-[var(--app-control-border)] px-2 py-0.5 text-xs font-semibold text-[var(--app-muted)]">
                      {result.type}
                    </span>
                  </span>
                  <span className="truncate text-xs text-[var(--app-muted)]">{result.subtitle}</span>
                </button>
              ))}
            </div>
          ) : loading ? (
            <p className="px-4 py-3 text-sm text-[var(--app-muted)]">Searching...</p>
          ) : (
            <p className="px-4 py-3 text-sm text-[var(--app-muted)]">No matching items found.</p>
          )}
        </div>
      ) : null}
    </form>
  )
}
