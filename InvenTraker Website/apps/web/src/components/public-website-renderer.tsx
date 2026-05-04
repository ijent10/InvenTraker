"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { ArrowRight, Star } from "lucide-react"

import {
  submitPublicWebsiteForm,
  type PublicWebsiteConfigRecord,
  type PublicWebsiteQuestionRecord
} from "@/lib/data/firestore"
import { AppButton, AppInput, AppSelect, AppSlider, AppTextarea } from "@inventracker/ui"

const publicInputClass = "rounded-2xl border border-black/10 bg-white px-4 py-3 text-slate-900 outline-none focus:border-black/30"
const publicTextareaClass = "min-h-28 rounded-2xl border border-black/10 bg-white px-4 py-3 text-slate-900 outline-none focus:border-black/30"

function answerInputType(question: PublicWebsiteQuestionRecord): string {
  if (question.type === "email") return "email"
  if (question.type === "phone") return "tel"
  return "text"
}

export function PublicWebsiteRenderer({
  site,
  previewMode = false
}: {
  site: PublicWebsiteConfigRecord
  previewMode?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [feedback, setFeedback] = useState("")
  const [rating, setRating] = useState(5)
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")

  useEffect(() => {
    const initialAnswers = Object.fromEntries(site.questions.map((question) => [question.id, ""]))
    setAnswers(initialAnswers)
    setStatus("idle")
  }, [site])

  const enabledSections = useMemo(() => site.sections.filter((section) => section.enabled), [site.sections])
  const enabledQuestions = useMemo(() => site.questions.filter((question) => question.enabled), [site.questions])
  const enabledMenuItems = useMemo(() => site.menuItems.filter((item) => item.enabled), [site.menuItems])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (previewMode) {
      setStatus("sent")
      return
    }
    setStatus("sending")
    try {
      await submitPublicWebsiteForm({
        organizationId: site.organizationId,
        siteSlug: site.slug,
        customerName,
        customerEmail,
        answers,
        feedback,
        rating: site.ratingsEnabled ? rating : undefined
      })
      setStatus("sent")
      setAnswers(Object.fromEntries(enabledQuestions.map((question) => [question.id, ""])))
      setCustomerName("")
      setCustomerEmail("")
      setFeedback("")
      setRating(5)
    } catch {
      setStatus("error")
    }
  }

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundColor: site.backgroundColor,
        color: site.textColor,
        fontFamily: site.fontFamily
      }}
    >
      {site.fontFileUrl ? (
        <style>{`@font-face{font-family:${JSON.stringify(site.fontFamily)};src:url(${JSON.stringify(site.fontFileUrl)});font-display:swap;}`}</style>
      ) : null}
      {previewMode ? (
        <div className="sticky top-0 z-30 border-b border-black/10 bg-white/90 px-4 py-2 text-center text-sm font-semibold text-slate-700 backdrop-blur">
          Draft preview. This page is visible only inside InvenTraker until you publish it.
        </div>
      ) : null}

      <section className="relative overflow-hidden">
        {site.heroImageUrl ? (
          <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${site.heroImageUrl})` }} />
        ) : null}
        <div className="relative mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center px-5 py-16 md:px-8">
          {site.logoUrl ? <img src={site.logoUrl} alt={`${site.siteName} logo`} className="mb-8 max-h-24 max-w-[260px] object-contain" /> : null}
          <p className="max-w-3xl text-5xl font-semibold leading-tight md:text-7xl">{site.siteName}</p>
          {site.tagline ? <p className="mt-5 max-w-2xl text-lg opacity-80 md:text-2xl">{site.tagline}</p> : null}
          <a
            href="#questionnaire"
            className="mt-8 inline-flex w-fit items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: site.accentColor }}
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-5 pb-20 md:px-8">
        {enabledSections.map((section) => {
          if (section.type === "hero") return null
          if (section.type === "menu") {
            return (
              <section key={section.id} className="py-4">
                <h2 className="text-3xl font-semibold">{section.title}</h2>
                {section.body ? <p className="mt-2 max-w-2xl opacity-75">{section.body}</p> : null}
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {enabledMenuItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">{item.name}</p>
                          {item.category ? <p className="mt-1 text-xs font-semibold uppercase opacity-60">{item.category}</p> : null}
                        </div>
                        {item.price ? <p className="font-semibold" style={{ color: site.accentColor }}>{item.price}</p> : null}
                      </div>
                      {item.description ? <p className="mt-3 text-sm opacity-75">{item.description}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            )
          }

          if (section.type === "questionnaire") {
            return (
              <section key={section.id} id="questionnaire" className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur md:p-8">
                <h2 className="text-3xl font-semibold">{section.title}</h2>
                {section.body ? <p className="mt-2 max-w-2xl opacity-75">{section.body}</p> : null}
                <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <AppInput
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      className={publicInputClass}
                      placeholder="Name"
                    />
                    <AppInput
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      className={publicInputClass}
                      placeholder="Email"
                    />
                  </div>
                  {enabledQuestions.map((question) => {
                    if (question.type === "long_text") {
                      return (
                        <AppTextarea
                          key={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          required={question.required}
                          className={publicTextareaClass}
                          placeholder={question.label}
                        />
                      )
                    }
                    if (question.type === "select") {
                      return (
                        <AppSelect
                          key={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          required={question.required}
                          className={publicInputClass}
                        >
                          <option value="">{question.label}</option>
                          {question.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </AppSelect>
                      )
                    }
                    if (question.type === "rating") {
                      return (
                        <label key={question.id} className="grid gap-2 text-sm font-semibold">
                          {question.label}
                          <AppSlider
                            min={1}
                            max={5}
                            value={answers[question.id] || "5"}
                            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          />
                        </label>
                      )
                    }
                    return (
                      <AppInput
                        key={question.id}
                        type={answerInputType(question)}
                        value={answers[question.id] ?? ""}
                        onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                        required={question.required}
                        className={publicInputClass}
                        placeholder={question.label}
                      />
                    )
                  })}
                  {site.feedbackEnabled ? (
                    <AppTextarea
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      className={publicTextareaClass}
                      placeholder="Feedback"
                    />
                  ) : null}
                  {site.ratingsEnabled ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold">Rating</span>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <AppButton
                          key={value}
                          type="button"
                          onClick={() => setRating(value)}
                          variant="secondary"
                          className={`!h-10 !w-10 !rounded-full border-black/10 !p-2 ${rating >= value ? "!text-yellow-500" : "!text-slate-300"}`}
                        >
                          <Star className="h-5 w-5 fill-current" />
                        </AppButton>
                      ))}
                    </div>
                  ) : null}
                  <AppButton
                    type="submit"
                    disabled={status === "sending"}
                    className="w-fit !rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: site.accentColor }}
                  >
                    {previewMode ? "Test Submit" : status === "sending" ? "Sending..." : "Submit"}
                  </AppButton>
                  {status === "sent" ? (
                    <p className="text-sm font-semibold text-emerald-700">
                      {previewMode ? "Preview submit worked. Nothing was sent." : "Submitted. Thank you."}
                    </p>
                  ) : null}
                  {status === "error" ? <p className="text-sm font-semibold text-red-700">Could not submit. Please try again.</p> : null}
                </form>
              </section>
            )
          }

          if (section.type === "feedback") return null

          return (
            <section key={section.id} className="py-4">
              <h2 className="text-3xl font-semibold">{section.title}</h2>
              {section.body ? <p className="mt-3 max-w-3xl whitespace-pre-line text-lg opacity-75">{section.body}</p> : null}
            </section>
          )
        })}
      </div>
    </main>
  )
}
