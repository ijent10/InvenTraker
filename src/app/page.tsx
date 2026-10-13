import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Boxes, Check, CheckCircle2, ClipboardCheck, History, PackageCheck, ScanLine, ShieldCheck, ShoppingCart, Sparkles, Users } from "lucide-react"
import { HomeAuthActions } from "@/components/home-auth-actions"

const attentionItems = [
  { name: "Strawberry clamshell", detail: "9 cases · below par", action: "Restock", tone: "amber" },
  { name: "Sourdough loaf", detail: "6 eaches · 2 expire soon", action: "Review", tone: "red" },
  { name: "Cabernet Sauvignon", detail: "18 eaches · selling normally", action: "Healthy", tone: "green" }
]

const foundation = [
  [Boxes, "One inventory record", "Products, counts, locations, units, vendors, dates, nutrition, and photos stay connected instead of living in separate files."],
  [ScanLine, "Work built around the floor", "Scan, count, portion, receive, restock, transfer, record waste, and draft orders from the same operational view."],
  [History, "A history your team can trust", "See what changed, who handled it, and which store it affected without chasing paper logs or group messages."]
] as const

const workflow = [
  ["See what needs attention", "Start with low stock, expiring items, pending checks, and unusual movement—not a wall of raw records."],
  ["Choose the right action", "Move stock from the backroom, adjust a count, portion an item, record waste, or add it to an order."],
  ["Keep everyone aligned", "The update appears in the same store record for the next employee, manager, and location."],
  ["Review before it becomes final", "Order drafts, suggested product details, and uncertain matches stay editable until a person approves them."]
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#061225] text-white">
      <section className="landing-hero relative border-b border-white/10">
        <div className="landing-hero-glow" />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="InvenTraker home">
            <Image src="/inventracker-logo.png" alt="" width={42} height={42} priority />
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">InvenTraker</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-white/70 lg:flex">
            <a href="#product-tour" className="transition hover:text-white">Product</a>
            <a href="#workflow" className="transition hover:text-white">Workflow</a>
            <a href="#intelligence" className="transition hover:text-white">Intelligence</a>
            <Link href="/signin" className="transition hover:text-white">Sign in</Link>
          </nav>
          <HomeAuthActions />
        </header>

        <div className="relative z-[1] mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:pb-28 lg:pt-20">
          <div>
            <p className="landing-eyebrow"><span className="h-2 w-2 rounded-full bg-[#4ade80]" />Inventory clarity for every shift</p>
            <h1 className="mt-6 text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.75rem]">
              Know your inventory.<br /><span className="text-[#93c5fd]">Run your operation.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/70">See what needs attention, make smarter stock decisions, and keep your team working from the same information.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#product-tour" className="landing-primary-button">Explore the product <ArrowRight className="h-4 w-4" /></a>
              <a href="#workflow" className="landing-secondary-button">See how it works</a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-white/48"><CheckCircle2 className="h-4 w-4 text-[#4ade80]" /> Built for real store workflows, from count to order.</p>
          </div>

          <div id="product-tour" className="landing-dashboard" aria-label="Illustrative inventory dashboard preview">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-5">
              <div><p className="text-sm font-semibold">Today at East Liberty</p><p className="mt-1 text-xs text-white/45">Monday, October 12 · Live inventory view</p></div>
              <span className="landing-live-pill"><span />Synced</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
              {[["Products", "142"], ["Low stock", "8"], ["Need review", "3"], ["Order drafts", "2"]].map(([label, value], index) => (
                <div key={label} className="bg-[#0a1930] px-4 py-4"><p className="text-xs text-white/45">{label}</p><p className={`mt-1 text-2xl font-semibold ${index === 1 ? "text-[#fbbf24]" : index === 2 ? "text-[#fca5a5]" : "text-white"}`}>{value}</p></div>
              ))}
            </div>
            <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.25fr_0.75fr]">
              <div>
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Needs attention</p><span className="text-xs font-semibold text-[#93c5fd]">View inventory</span></div>
                <div className="grid gap-2">
                  {attentionItems.map((item) => <div key={item.name} className="landing-attention-row"><span className={`landing-status-dot landing-status-${item.tone}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-white/45">{item.detail}</p></div><span className={`landing-status-label landing-label-${item.tone}`}>{item.action}</span></div>)}
                </div>
              </div>
              <div className="landing-order-summary">
                <div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb]/20 text-[#93c5fd]"><ShoppingCart className="h-4 w-4" /></span><span className="text-xs text-white/40">Draft</span></div>
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-white/40">Next order</p><p className="mt-1 text-2xl font-semibold">12 items</p>
                <p className="mt-2 text-xs leading-5 text-white/50">3 items can be pulled from backstock before buying more.</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-3/4 rounded-full bg-[#3b82f6]" /></div>
              </div>
            </div>
            <p className="border-t border-white/10 px-5 py-3 text-[11px] text-white/35">Illustrative metrics using realistic store scenarios.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div><p className="landing-section-label">The problem</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Inventory shouldn&apos;t require five systems.</h2></div>
          <p className="max-w-2xl text-lg leading-8 text-white/62 lg:justify-self-end">Counts in one place, orders in another, checks on paper, and updates in group messages create gaps your team has to remember. InvenTraker connects the work around the item, the store, and the people handling it.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {foundation.map(([Icon, title, detail], index) => <article key={title} className={`landing-foundation-card ${index === 0 ? "md:-translate-y-3" : index === 2 ? "md:translate-y-3" : ""}`}><div className="landing-icon-disc"><Icon className="h-5 w-5" /></div><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-white/58">{detail}</p></article>)}
        </div>
      </section>

      <section id="workflow" className="border-y border-white/10 bg-[#09172b]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-28">
          <div className="lg:sticky lg:top-12 lg:self-start"><p className="landing-section-label text-[#86efac]">One connected workflow</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">From a signal to a completed task.</h2><p className="mt-5 max-w-md text-base leading-7 text-white/60">The next action stays close to the information that caused it, so employees can move quickly without losing context.</p></div>
          <div className="grid gap-0 border-l border-white/12 pl-5 sm:pl-8">
            {workflow.map(([title, detail], index) => <div key={title} className="landing-workflow-step"><span className="landing-step-number">0{index + 1}</span><div><h3 className="text-xl font-semibold">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-white/58">{detail}</p></div></div>)}
          </div>
        </div>
      </section>

      <section id="intelligence" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="landing-intelligence-panel">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-[#93c5fd]" /><span className="font-semibold">Decision support</span></div><span className="text-xs text-white/38">Uses store context</span></div>
            <div className="p-5 sm:p-6"><div className="landing-question">What should I do about strawberries today?</div><div className="landing-answer"><p className="font-semibold text-white">Move stock before ordering more.</p><p className="mt-2 text-sm leading-6 text-white/58">Floor stock is below par, but 4 cases are available in backstock. Move 3 cases to the floor and review the remaining shelf life before adding to the vendor draft.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{[["Floor", "9 cases"], ["Backstock", "4 cases"], ["Suggested", "Move 3"]].map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.055] p-3"><p className="text-xs text-white/38">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div></div></div>
          </div>
          <div><p className="landing-section-label">Smarter inventory decisions</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Answers grounded in what your store is doing.</h2><p className="mt-5 text-base leading-7 text-white/62">InvenTraker can bring product facts, stock levels, waste, dates, and ordering rules into one practical answer. Your team still decides what becomes official.</p><div className="mt-7 grid gap-3">{["Clarifies uncertain product matches", "Shows the records behind a recommendation", "Keeps suggested changes pending until review"].map((text) => <div key={text} className="flex items-center gap-3 text-sm text-white/70"><Check className="h-4 w-4 text-[#4ade80]" />{text}</div>)}</div></div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center"><div><p className="landing-section-label text-[#86efac]">Available now</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Built around work your team already does.</h2></div><div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{["Scan and count inventory", "Receive, restock, transfer, and waste", "Build editable order drafts", "Review activity history"].map((text) => <div key={text} className="flex items-center gap-2 text-sm text-white/68"><CheckCircle2 className="h-4 w-4 text-[#4ade80]" />{text}</div>)}</div></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[[ShieldCheck, "Review before commit", "Drafts and suggested changes remain editable until someone approves them."], [Users, "Role-aware access", "Owners, managers, and employees see the controls that fit their responsibility."], [ClipboardCheck, "Traceable activity", "Counts, moves, waste, receiving, portions, and orders create a useful history."]].map(([Icon, title, detail]) => { const ItemIcon = Icon as typeof ShieldCheck; return <div key={title as string} className="landing-proof-item"><ItemIcon className="h-5 w-5 text-[#93c5fd]" /><div><p className="font-semibold">{title as string}</p><p className="mt-1 text-sm leading-6 text-white/50">{detail as string}</p></div></div> })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28"><div className="landing-final-cta-new"><div className="relative z-[1] max-w-2xl"><p className="landing-section-label text-[#bfdbfe]">See InvenTraker in action</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Give your team one clear place to run inventory.</h2><p className="mt-5 max-w-xl text-base leading-7 text-white/64">Explore the product flow, then create an organization or sign in to your existing workspace.</p><div className="mt-8 flex flex-wrap gap-3"><HomeAuthActions variant="final" /><Link href="/signin" className="landing-secondary-button">Sign in to your workspace</Link></div></div><div className="landing-cta-mark"><PackageCheck className="h-20 w-20" /></div></div></section>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/42 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Image src="/inventracker-logo.png" alt="" width={28} height={28} /><span className="font-semibold text-white/70">InvenTraker</span></div><p>Inventory decisions, connected from floor to order.</p></div></footer>
    </main>
  )
}
