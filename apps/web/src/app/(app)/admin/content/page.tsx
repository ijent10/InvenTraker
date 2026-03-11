"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppInput, AppTextarea } from "@inventracker/ui"
import { FirebaseError } from "firebase/app"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchPublicSiteContent, savePublicSiteContent, type SiteFaqEntry } from "@/lib/data/firestore"

export default function AdminContentPage() {
  const { canViewAdmin } = useOrgContext()
  const { user } = useAuthUser()
  const { data } = useQuery({
    queryKey: ["admin-public-site-content"],
    queryFn: fetchPublicSiteContent,
    enabled: canViewAdmin
  })

  const [privacyContent, setPrivacyContent] = useState("")
  const [termsContent, setTermsContent] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [faq, setFaq] = useState<SiteFaqEntry[]>([{ id: "faq_1", question: "", answer: "" }])
  const [featureRequestCategories, setFeatureRequestCategories] = useState<string[]>([
    "workflow",
    "inventory",
    "analytics",
    "account",
    "other"
  ])
  const [newFeatureCategory, setNewFeatureCategory] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setPrivacyContent(data.privacyContent)
    setTermsContent(data.termsContent)
    setContactEmail(data.contactEmail)
    setContactPhone(data.contactPhone)
    setFaq(data.faq.length ? data.faq : [{ id: "faq_1", question: "", answer: "" }])
    setFeatureRequestCategories(
      data.featureRequestCategories.length
        ? data.featureRequestCategories
        : ["workflow", "inventory", "analytics", "account", "other"]
    )
  }, [data])

  const save = async () => {
    if (!user?.uid) return
    setMessage(null)
    setError(null)
    try {
      await savePublicSiteContent(user.uid, {
        privacyContent,
        termsContent,
        contactEmail,
        contactPhone,
        faq: faq.map((entry, index) => ({ ...entry, id: entry.id || `faq_${index + 1}` })),
        featureRequestCategories
      })
      setMessage("Public content saved.")
    } catch (error) {
      if (error instanceof FirebaseError) {
        setError(error.message || "Could not save content.")
      } else if (error instanceof Error) {
        setError(error.message || "Could not save content.")
      } else {
        setError("Could not save content.")
      }
    }
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Content" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Content" subtitle="Manage Privacy, Terms, Contact details, and FAQ." />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Privacy</h2>
          <AppTextarea className="mt-4 min-h-[240px]" value={privacyContent} onChange={(event) => setPrivacyContent(event.target.value)} />
        </AppCard>

        <AppCard>
          <h2 className="card-title">Terms</h2>
          <AppTextarea className="mt-4 min-h-[240px]" value={termsContent} onChange={(event) => setTermsContent(event.target.value)} />
        </AppCard>

        <AppCard>
          <h2 className="card-title">Contact</h2>
          <div className="mt-4 grid gap-3">
            <AppInput placeholder="Support email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
            <AppInput placeholder="Support phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">FAQ</h2>
          <div className="mt-4 space-y-3">
            {faq.map((entry, index) => (
              <div key={entry.id || `faq-row-${index}`} className="rounded-2xl border border-app-border p-3">
                <AppInput
                  placeholder={`Question ${index + 1}`}
                  value={entry.question}
                  onChange={(event) =>
                    setFaq((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, question: event.target.value } : row
                      )
                    )
                  }
                />
                <AppTextarea
                  className="mt-2"
                  placeholder="Answer"
                  value={entry.answer}
                  onChange={(event) =>
                    setFaq((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, answer: event.target.value } : row
                      )
                    )
                  }
                />
              </div>
            ))}
            <div className="flex gap-2">
              <AppButton
                variant="secondary"
                onClick={() =>
                  setFaq((prev) => [
                    ...prev,
                    { id: `faq_${Date.now()}_${prev.length + 1}`, question: "", answer: "" }
                  ])
                }
              >
                + Add question
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => setFaq((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
              >
                − Remove last
              </AppButton>
            </div>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Feature Request Categories</h2>
          <p className="secondary-text mt-2">These categories show in user request forms and in the admin inbox.</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {featureRequestCategories.map((category) => (
                <AppButton
                  key={category}
                  type="button"
                  variant="secondary"
                  className="!h-8 !rounded-full !px-3 !py-1 !text-xs"
                  onClick={() =>
                    setFeatureRequestCategories((prev) => prev.filter((entry) => entry !== category))
                  }
                >
                  <span>{category}</span>
                  <span className="text-app-muted">×</span>
                </AppButton>
              ))}
            </div>
            <div className="flex gap-2">
              <AppInput
                placeholder="Add category"
                value={newFeatureCategory}
                onChange={(event) => setNewFeatureCategory(event.target.value)}
              />
              <AppButton
                variant="secondary"
                onClick={() => {
                  const next = newFeatureCategory.trim().toLowerCase()
                  if (!next) return
                  setFeatureRequestCategories((prev) => (prev.includes(next) ? prev : [...prev, next]))
                  setNewFeatureCategory("")
                }}
              >
                Add
              </AppButton>
            </div>
          </div>
        </AppCard>
      </div>
      <div className="mt-4">
        <AppButton onClick={() => void save()}>Save Content</AppButton>
      </div>
      {message ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </div>
  )
}
