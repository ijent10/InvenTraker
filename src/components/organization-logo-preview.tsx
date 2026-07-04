"use client"

import { useEffect, useState } from "react"

export function OrganizationLogoPreview() {
  const fallbackSrc = "/inventracker-mark.svg"
  const [logoUrl, setLogoUrl] = useState(fallbackSrc)
  const [failedSrc, setFailedSrc] = useState("")
  const safeSrc = logoUrl && logoUrl !== failedSrc ? logoUrl : fallbackSrc

  useEffect(() => {
    const field = document.querySelector<HTMLInputElement>('[name="logoUrl"]')
    if (!field) return undefined

    function refreshPreview() {
      setFailedSrc("")
      setLogoUrl(field?.value.trim() || fallbackSrc)
    }

    refreshPreview()
    field.addEventListener("input", refreshPreview)
    field.addEventListener("change", refreshPreview)

    return () => {
      field.removeEventListener("input", refreshPreview)
      field.removeEventListener("change", refreshPreview)
    }
  }, [])

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] bg-white/95 p-2">
        {/* User-entered organization logos can come from arbitrary approved business URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safeSrc} alt="" className="h-full w-full object-contain" onError={() => setFailedSrc(safeSrc)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--app-text)]">Logo preview</p>
        <p className="truncate text-xs text-[var(--app-muted)]">{safeSrc}</p>
      </div>
    </div>
  )
}
