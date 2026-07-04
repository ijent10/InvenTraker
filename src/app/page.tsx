import Image from "next/image"
import Link from "next/link"
import { Boxes, CheckCircle2, ClipboardCheck, PackageCheck, ScanLine, Sparkles } from "lucide-react"

import { HomeAuthActions } from "@/components/home-auth-actions"

const productCards = [
  {
    name: "Cabernet Sauvignon",
    department: "Beer & Wine",
    store: "Liberty Ave",
    count: "18 eaches",
    status: "Healthy"
  },
  {
    name: "Sourdough loaf",
    department: "Bakery",
    store: "Liberty Ave",
    count: "34 eaches",
    status: "Restock soon"
  },
  {
    name: "Strawberry clamshell",
    department: "Produce",
    store: "Liberty Ave",
    count: "9 cases",
    status: "Date tracked"
  }
]

const features = [
  {
    title: "Inventory that moves with the store",
    detail: "Track front stock, backstock, locations, categories, vendors, pars, and expiration behavior from one clean workspace.",
    icon: Boxes
  },
  {
    title: "Orders without the guesswork",
    detail: "Build vendor drafts from current stock, reorder points, and store needs, then keep every draft editable before submission.",
    icon: PackageCheck
  },
  {
    title: "Health checks and history",
    detail: "Create flexible checks, keep responses by employee, and review spot checks, restocks, waste, receiving, portions, and orders.",
    icon: ClipboardCheck
  },
  {
    title: "The assistant for product decisions",
    detail: "Ask product, nutrition, inventory, waste, and ordering questions while keeping final approvals with your team.",
    icon: Sparkles
  }
]

const workflow = [
  ["Scan or add", "Create items with default units, expiration settings, categories, locations, and vendor details."],
  ["Count with context", "Separate front stock from backstock and keep current quantity tied to the same item record."],
  ["Review the signal", "See low stock, waste, expiration risk, health check gaps, and order readiness in quick widgets."],
  ["Act and remember", "Every action can flow into history so teams can see who did what, when, and where."]
]

const stats = [
  ["Front stock", "6"],
  ["Backstock", "12"],
  ["Par", "24"],
  ["Order pull", "6"]
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#061225] text-white">
      <section className="relative min-h-[92vh] overflow-hidden border-b border-white/10">
        <div className="landing-scene absolute inset-0">
          <div className="landing-grid" />
          <div className="landing-orbit landing-orbit-one" />
          <div className="landing-orbit landing-orbit-two" />
          <div className="landing-product-board">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
                <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
                <span className="h-3 w-3 rounded-full bg-[#2563eb]" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Live store view</span>
            </div>
            <div className="grid gap-3 p-4">
              {productCards.map((product) => (
                <div key={product.name} className="landing-product-row">
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="mt-1 text-xs text-white/58">
                      {product.department} · {product.store}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{product.count}</p>
                    <p className="mt-1 text-xs text-[#93c5fd]">{product.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="landing-scan-card">
            <ScanLine className="h-5 w-5 text-[#93c5fd]" />
            <div>
              <p className="text-sm font-semibold">Scan to count</p>
              <p className="text-xs text-white/55">Floor and backroom stay connected</p>
            </div>
            <span className="landing-scan-line" />
          </div>
          <div className="landing-order-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Suggested order</p>
            <p className="mt-2 text-3xl font-semibold">6</p>
            <p className="mt-1 text-sm text-white/55">pull from backstock before ordering more</p>
          </div>
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/inventracker-mark.svg" alt="" width={42} height={42} priority />
            <span className="text-lg font-semibold tracking-tight">InvenTracker</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-white/70 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#workflow" className="transition hover:text-white">Workflow</a>
            <a href="#assistant" className="transition hover:text-white">Assistant</a>
          </nav>
          <HomeAuthActions />
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(92vh-88px)] max-w-7xl items-center px-5 pb-16 pt-10 sm:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-sm font-semibold text-[#bfdbfe] backdrop-blur">
              Built for inventory teams that move fast
            </p>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              InvenTracker keeps stock, orders, and store work in sync.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
              A modern operating system for inventory, ordering, health checks, product details, employees, and store history. Clean enough for daily work,
              structured enough to grow with every location.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <HomeAuthActions variant="hero" />
              <a
                href="#features"
                className="inline-flex min-h-12 items-center rounded-md border border-white/15 bg-white/8 px-5 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/12"
              >
                See what it handles
              </a>
            </div>
            <div className="landing-mobile-preview mt-8">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Live store view</span>
                <span className="rounded-full bg-[#22c55e]/15 px-2 py-1 text-xs font-semibold text-[#86efac]">Synced</span>
              </div>
              <div className="grid gap-2 p-3">
                {productCards.map((product) => (
                  <div key={product.name} className="landing-product-row">
                    <div>
                      <p className="text-sm font-semibold text-white">{product.name}</p>
                      <p className="mt-1 text-xs text-white/58">
                        {product.department} · {product.store}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{product.count}</p>
                      <p className="mt-1 text-xs text-[#93c5fd]">{product.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#93c5fd]">What it handles</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Less jumping between tools. More actual control.</h2>
          <p className="mt-4 text-base leading-7 text-white/65">
            InvenTracker is built around store work as it actually happens: counting, moving, checking, ordering, correcting, and reviewing.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <article key={feature.title} className="landing-feature-card" style={{ animationDelay: `${index * 120}ms` }}>
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#2563eb]/20 text-[#bfdbfe]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/62">{feature.detail}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section id="workflow" className="border-y border-white/10 bg-white/[0.035]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#86efac]">Daily workflow</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">From count to action without losing the thread.</h2>
            <p className="mt-4 text-base leading-7 text-white/65">
              Every screen is meant to feed the same source of truth, so future mobile apps can read the same records the website uses.
            </p>
          </div>
          <div className="grid gap-3">
            {workflow.map(([title, detail], index) => (
              <div key={title} className="landing-step">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-[#0f172a]">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/62">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="assistant" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div className="landing-assistant-panel">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <Sparkles className="h-5 w-5 text-[#93c5fd]" />
            <div>
              <p className="font-semibold">Assistant preview</p>
              <p className="text-xs text-white/50">Product and store-aware answers</p>
            </div>
          </div>
          <div className="grid gap-3 p-4">
            <div className="landing-chat-bubble landing-chat-user">Is this product kosher, and do we need to order more?</div>
            <div className="landing-chat-bubble landing-chat-assistant">
              I can check product evidence, labels, local stock, backstock, and order rules. If the product match is unclear, I will ask which item you mean first.
            </div>
            <div className="grid grid-cols-2 gap-3">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/45">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#93c5fd]">The assistant</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Helpful answers, with the team still in control.</h2>
          <p className="mt-4 text-base leading-7 text-white/65">
            The assistant is designed to understand products, inventory, waste, orders, nutrition, and store context. Suggested product details can wait for
            review before becoming official data.
          </p>
          <div className="mt-6 grid gap-3">
            {["Asks for clarification when a product match is uncertain", "Surfaces inventory and ordering context in plain language", "Keeps verified product data separate from suggestions"].map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm leading-6 text-white/72">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22c55e]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <div className="landing-final-cta">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bfdbfe]">Ready for the next layer</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Start with the workspace. Grow into the whole operation.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
              Inventory, products, stores, employees, health checks, history, and the assistant can all point at the same database-backed system.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <HomeAuthActions variant="final" />
          </div>
        </div>
      </section>
    </main>
  )
}
