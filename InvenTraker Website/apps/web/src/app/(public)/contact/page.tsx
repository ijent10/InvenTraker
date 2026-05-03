"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppInput, AppTextarea, appButtonClass } from "@inventracker/ui"

import { createContactInquiry, fetchPublicSiteContent } from "@/lib/data/firestore"

export default function ContactPage() {
  const { data } = useQuery({
    queryKey: ["public-site-content", "contact"],
    queryFn: fetchPublicSiteContent,
    staleTime: 60_000
  })

  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setMessage(null)
    setError(null)
    if (!email.trim() || !subject.trim() || !content.trim()) {
      setError("Email, subject, and content are required.")
      return
    }
    try {
      await createContactInquiry({ email, subject, content })
      setMessage("Inquiry sent. Our team will follow up soon.")
      setEmail("")
      setSubject("")
      setContent("")
    } catch {
      setError("Could not send inquiry. Please try again.")
    }
  }

  return (
    <div className="public-landing min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/"
          className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")}
          style={{ borderColor: "#2563EB", color: "#2563EB" }}
        >
          ← Back
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Contact</h1>
        <p className="mt-3 text-slate-600">Reach out to the InvenTraker team.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h2 className="card-title text-slate-900">Support</h2>
            <p className="secondary-text mt-3 text-slate-600">Email: {data?.contactEmail || "support@inventraker.com"}</p>
            <p className="secondary-text mt-2 text-slate-600">Phone: {data?.contactPhone || "(000) 000-0000"}</p>

            <h3 className="mt-6 text-lg font-semibold text-slate-900">FAQ</h3>
            <div className="mt-3 space-y-3">
              {(data?.faq ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No FAQ entries yet.</p>
              ) : (
                (data?.faq ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{entry.question}</p>
                    <p className="mt-1 text-sm text-slate-600">{entry.answer}</p>
                  </div>
                ))
              )}
            </div>
          </AppCard>

          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h2 className="card-title text-slate-900">Send us a message</h2>
            <div className="mt-4 grid gap-3">
              <AppInput placeholder="Your email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <AppInput placeholder="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
              <AppTextarea
                placeholder="How can we help?"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <AppButton onClick={() => void submit()}>Send inquiry</AppButton>
            </div>
          </AppCard>
        </div>

        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      </div>
    </div>
  )
}
