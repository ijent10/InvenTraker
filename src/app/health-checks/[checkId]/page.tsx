import { notFound } from "next/navigation"
import { ArrowLeft, ClipboardCheck } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { getHealthChecks } from "@/lib/server-data"

function statusTone(status: "Current" | "Due today" | "Overdue") {
  if (status === "Current") return "green"
  if (status === "Overdue") return "red"
  return "amber"
}

export default async function HealthCheckDetailPage({ params }: { params: { checkId: string } }) {
  const healthChecks = await getHealthChecks()
  const check = healthChecks.find((candidate) => candidate.id === params.checkId)

  if (!check) notFound()

  return (
    <>
      <PageHeader
        title={check.name}
        description="Review questions, required fields, rules, and the latest saved responses."
        actions={
          <ButtonLink href="/health-checks" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to checks
          </ButtonLink>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          <div className="border-b border-[var(--app-border)] px-4 py-4">
            <h2 className="font-semibold text-[var(--app-text)]">Questions</h2>
            <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">
              Required fields must be answered before a response can be submitted.
            </p>
          </div>
          <DataTable
            columns={["Question", "Answer type", "Required", "Review rule"]}
            rows={check.questions.map((question) => [
              <span key={`${question.id}-label`} className="font-semibold text-[var(--app-text)]">
                {question.label}
              </span>,
              question.answerType,
              <StatusPill key={`${question.id}-required`} tone={question.required ? "green" : "neutral"}>
                {question.required ? "Required" : "Optional"}
              </StatusPill>,
              question.reviewRule
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-text)]">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Check status</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{check.store}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {[
              ["Schedule", check.schedule],
              ["Last completed", check.lastCompleted],
              ["Completed by", check.completedBy],
              ["Saved responses", check.responses.toLocaleString()]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{label}</p>
                <p className="mt-1 font-semibold text-[var(--app-text)]">{value}</p>
              </div>
            ))}
            <StatusPill tone={statusTone(check.status)}>{check.status}</StatusPill>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="border-b border-[var(--app-border)] px-4 py-4">
          <h2 className="font-semibold text-[var(--app-text)]">Latest responses</h2>
          <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">Each response is stored with the employee, title, timestamp, and answers.</p>
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {check.responseHistory.map((response) => (
            <div key={response.id} className="grid gap-4 px-4 py-4 xl:grid-cols-[300px_1fr]">
              <div>
                <p className="font-semibold text-[var(--app-text)]">{response.completedBy}</p>
                <p className="mt-1 text-sm text-[var(--app-muted)]">
                  {response.employeeId} - {response.department}
                </p>
                <p className="mt-1 text-sm text-[var(--app-muted)]">
                  {response.title} - {response.completedAt}
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {response.answers.map((answer) => (
                  <div key={`${response.id}-${answer.question}`} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{answer.question}</p>
                    <p className="mt-1 font-semibold text-[var(--app-text)]">{answer.value}</p>
                    {answer.flagged ? <p className="mt-2 text-xs font-semibold text-amber-300">Flagged for review</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
