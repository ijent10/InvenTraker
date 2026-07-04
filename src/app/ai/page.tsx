import { BrainCircuit, Database, Globe2, ImageIcon, Network, Sparkles } from "lucide-react"

import { AiAssistantConsole } from "@/components/ai-assistant-console"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { buildOperationalContext } from "@/lib/ai/context"

const aiPillars = [
  {
    title: "Product intelligence",
    detail: "Answers product questions from catalog fields, SKU, supplier evidence, compliance notes, allergens, and dietary status.",
    icon: Database,
    status: "Started"
  },
  {
    title: "Local awareness",
    detail: "Reads inventory, front stock, back stock, waste, vendors, reorder points, health checks, and store context.",
    icon: Network,
    status: "Started"
  },
  {
    title: "National awareness",
    detail: "Checks public product facts and national recall/enforcement signals before answering product safety or availability questions.",
    icon: Globe2,
    status: "Live"
  },
  {
    title: "Product images",
    detail: "Finds public product image candidates from product name, SKU, barcode, and source-backed product records.",
    icon: ImageIcon,
    status: "Live"
  }
]

const sourceConnectors = [
  {
    name: "Local InvenTracker data",
    status: "Live",
    detail: "Central catalog, organization product references, store inventory, front/back stock, waste signals, vendors, prices, case sizes, and reorder points."
  },
  {
    name: "Open Food Facts",
    status: "Live",
    detail: "External product matches, labels, allergens, ingredients, nutrition facts, barcode pages, and product images."
  },
  {
    name: "openFDA food enforcement",
    status: "Live",
    detail: "Recall and enforcement matches from the public FDA food enforcement endpoint."
  },
  {
    name: "OpenAI Responses API",
    status: "Optional",
    detail: "Model reasoning and hosted web search activate when OPENAI_API_KEY is configured, including event and broader web checks for ordering."
  },
  {
    name: "Pending verification",
    status: "Live",
    detail: "Assistant-filled nutrition, images, labels, allergens, and ingredients require approval before becoming product data."
  },
  {
    name: "Supplier documents",
    status: "Next",
    detail: "Kosher certificates, spec sheets, invoice data, package photos, and vendor-owned product images."
  },
  {
    name: "Vector memory",
    status: "Next",
    detail: "Embeddings for supplier files, product sheets, policies, and historical operational decisions."
  }
]

export default async function AiPage() {
  const context = await buildOperationalContext()

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Product intelligence, local operations awareness, national search hooks, and image discovery for InvenTracker."
        actions={
          <ButtonLink href="/ai/sources" variant="secondary" icon={<Sparkles className="h-4 w-4" />}>
            Source settings
          </ButtonLink>
        }
      />

      <AiAssistantConsole />

      <div className="app-tip mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {aiPillars.map((pillar) => {
          const Icon = pillar.icon
          return (
            <Panel key={pillar.title} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusPill tone={pillar.status === "Started" || pillar.status === "Live" ? "green" : "blue"}>{pillar.status}</StatusPill>
              </div>
              <h2 className="mt-4 font-semibold text-white">{pillar.title}</h2>
              <p className="app-tip mt-2 text-sm leading-6 text-slate-400">{pillar.detail}</p>
            </Panel>
          )
        })}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-sm text-slate-400">Product records loaded</p>
          <p className="mt-2 text-3xl font-semibold text-white">{context.centralCatalog.length}</p>
          <p className="mt-1 text-xs text-slate-500">Central catalog</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm text-slate-400">Org product references</p>
          <p className="mt-2 text-3xl font-semibold text-white">{context.organizationProducts.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm text-slate-400">Store inventory records</p>
          <p className="mt-2 text-3xl font-semibold text-white">{context.inventory.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm text-slate-400">Ordering signals</p>
          <p className="mt-2 text-3xl font-semibold text-white">{context.orderingAwareness?.trafficHeuristics.length ?? 0}</p>
        </Panel>
      </div>

      <Panel className="app-tip mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <BrainCircuit className="h-5 w-5 text-blue-300" />
              Assistant roadmap
            </h2>
            <p className="app-tip mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              This first layer gives the assistant a clean contract: local data context, product evidence, cautious answer policy, optional
              external search, and product image candidates. The next layer can add Firebase-backed memory, supplier documents, embeddings,
              and automated ordering recommendations without redesigning the page.
            </p>
          </div>
          <StatusPill tone="blue">Foundation</StatusPill>
        </div>
      </Panel>

      <Panel className="app-tip mb-6 p-4">
        <h2 className="font-semibold text-white">Source connectors</h2>
        <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
          The assistant is only as useful as its evidence. These connectors keep local facts, national awareness, image discovery, and future
          supplier documents separated so answers can show where they came from.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceConnectors.map((connector) => (
            <div key={connector.name} className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-white">{connector.name}</p>
                <StatusPill tone={connector.status === "Live" ? "green" : connector.status === "Optional" ? "blue" : "neutral"}>
                  {connector.status}
                </StatusPill>
              </div>
              <p className="app-tip mt-2 text-sm leading-5 text-slate-400">{connector.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
