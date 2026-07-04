"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileText,
  Lock,
  PackageSearch,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users
} from "lucide-react"

import {
  createDemoSnapshot,
  demoEmployees,
  demoPlans,
  type DemoEmployee,
  type DemoFeature,
  type DemoInsight,
  type DemoOrder,
  type DemoPlanId,
  type DemoPolicy,
  type DemoProduct
} from "@/lib/demo-workspace-data"

type DemoTab = "dashboard" | "inventory" | "orders" | "employees" | "files" | "insights" | "assistant"

type DemoState = {
  started: boolean
  planId: DemoPlanId
  roleId: string
  activeTab: DemoTab
  products: DemoProduct[]
  employees: DemoEmployee[]
  policies: DemoPolicy[]
  orders: DemoOrder[]
  insights: DemoInsight[]
  notes: string[]
}

const storageKey = "inventracker-public-demo-session-v1"

const tabs: Array<{ id: DemoTab; label: string; feature: DemoFeature; icon: typeof PackageSearch }> = [
  { id: "dashboard", label: "Dashboard", feature: "dashboard", icon: BarChart3 },
  { id: "inventory", label: "Inventory", feature: "inventory", icon: PackageSearch },
  { id: "orders", label: "Orders", feature: "orders", icon: ShoppingCart },
  { id: "employees", label: "Employees", feature: "employees", icon: Users },
  { id: "files", label: "Files", feature: "files", icon: FileText },
  { id: "insights", label: "Insights", feature: "insights", icon: Sparkles },
  { id: "assistant", label: "Assistant", feature: "assistant", icon: Bot }
]

function initialState(planId: DemoPlanId = "growth", roleId = demoEmployees[1]?.id ?? "demo-emp-02"): DemoState {
  return {
    started: false,
    planId,
    roleId,
    activeTab: "dashboard",
    ...createDemoSnapshot()
  }
}

function loadState(): DemoState {
  if (typeof window === "undefined") return initialState()
  const saved = window.sessionStorage.getItem(storageKey)
  if (!saved) return initialState()

  try {
    const parsed = JSON.parse(saved) as DemoState
    if (!parsed.products?.length || !parsed.employees?.length) return initialState()
    return parsed
  } catch {
    return initialState()
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function featureCopy(feature: DemoFeature) {
  const names: Record<DemoFeature, string> = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    orders: "Orders",
    employees: "Employees",
    files: "Files and policies",
    insights: "Insights",
    assistant: "Assistant",
    advancedPermissions: "Advanced permissions",
    webEnrichment: "Web enrichment"
  }
  return names[feature]
}

function statusTone(status: DemoProduct["status"] | DemoOrder["status"]) {
  if (status === "Healthy" || status === "Ready") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
  if (status === "Low" || status === "Needs review") return "border-amber-400/30 bg-amber-400/10 text-amber-100"
  if (status === "Overstock") return "border-blue-400/30 bg-blue-400/10 text-blue-100"
  return "border-white/15 bg-white/10 text-white/70"
}

function DemoPill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${className || "border-white/15 bg-white/8 text-white/70"}`}>{children}</span>
}

function LockedPanel({ feature, planName }: { feature: DemoFeature; planName: string }) {
  return (
    <div className="rounded-panel border border-white/12 bg-white/[0.04] p-8 text-center">
      <Lock className="mx-auto h-8 w-8 text-amber-200" />
      <h2 className="mt-4 text-xl font-semibold text-white">{featureCopy(feature)} is locked in this demo plan</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/60">
        You are currently experiencing the {planName} plan. Switch plans at the top of the demo to see how the workspace changes by package.
      </p>
    </div>
  )
}

function useToast() {
  const [toast, setToast] = useState("")

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(""), 2200)
  }

  return { toast, showToast }
}

function answerDemoQuestion(question: string, products: DemoProduct[], planAllowsWeb: boolean) {
  const text = question.toLowerCase()
  const product =
    products.find((item) => text.includes(item.name.toLowerCase())) ??
    products.find((item) => text.includes(item.category.toLowerCase())) ??
    products.find((item) => text.includes(item.department.toLowerCase())) ??
    products.find((item) => item.name.toLowerCase().includes("sourdough"))

  if (!product) {
    return "I could not confidently match that to a demo product. Try a product name, department, category, SKU, or something like “bread calories.”"
  }

  if (/(calorie|nutrition|ingredient|allergen|protein|sodium)/.test(text)) {
    if (!product.nutrition) {
      return `${product.name} does not have nutrition facts in this demo record. In the real workspace, the assistant would create a pending enrichment suggestion for someone to approve.`
    }

    return `${product.name} has ${product.nutrition.caloriesKcal} calories per ${product.nutrition.servingSize}. Ingredients: ${product.nutrition.ingredients}. Allergens: ${product.nutrition.allergens}. ${
      planAllowsWeb ? "The Enterprise demo also shows how web enrichment can propose additional source-backed fields for review." : "Switch to Enterprise to preview web enrichment behavior."
    }`
  }

  if (/kosher/.test(text)) {
    const kosherTag = product.nutrition?.dietaryTags.find((tag) => tag.includes("kosher"))
    return kosherTag
      ? `${product.name}: kosher status is not recorded as verified in this demo. Do not call it kosher until a source-backed certification is approved.`
      : `${product.name}: no verified kosher certification is stored in this demo record. That does not prove it is non-kosher; it means the claim needs source evidence.`
  }

  if (/(order|reorder|stock|inventory|backstock|front)/.test(text)) {
    const needed = Math.max(0, product.par - product.onHand)
    return `${product.name} has ${product.frontStock} front stock and ${product.backStock} backstock, ${product.onHand} total. Par is ${product.par}; suggested order/pull need is ${needed} ${product.unit}.`
  }

  return `${product.name} is a ${product.department} item from ${product.vendor}. It has ${product.onHand} ${product.unit} on hand, costs ${money(product.cost)}, sells for ${money(product.price)}, and is currently marked ${product.status}.`
}

export function DemoWorkspace() {
  const [state, setState] = useState<DemoState>(() => initialState())
  const [query, setQuery] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [selectedPolicyId, setSelectedPolicyId] = useState("")
  const [assistantQuestion, setAssistantQuestion] = useState("How many calories are in the bread?")
  const [assistantAnswer, setAssistantAnswer] = useState("")
  const { toast, showToast } = useToast()

  useEffect(() => {
    setState(loadState())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !state.started) return
    window.sessionStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  const plan = demoPlans.find((candidate) => candidate.id === state.planId) ?? demoPlans[1]
  const employee = state.employees.find((candidate) => candidate.id === state.roleId) ?? state.employees[0]
  const selectedProduct = state.products.find((product) => product.id === selectedProductId) ?? state.products[0]
  const selectedPolicy = state.policies.find((policy) => policy.id === selectedPolicyId) ?? state.policies[0]
  const filteredProducts = useMemo(() => {
    const needle = query.toLowerCase().trim()
    if (!needle) return state.products.slice(0, 18)
    return state.products
      .filter((product) =>
        [product.name, product.sku, product.barcode, product.department, product.category, product.vendor, product.location].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .slice(0, 30)
  }, [query, state.products])
  const lowStock = state.products.filter((product) => product.status === "Low").length
  const expiring = state.products.filter((product) => product.expires && product.averageExpirationDays && product.averageExpirationDays <= 7).length
  const inventoryValue = state.products.reduce((sum, product) => sum + product.onHand * product.cost, 0)
  const canUseFeature = (feature: DemoFeature) => plan.features.includes(feature)
  const roleCan = (permission: string) => employee?.permissions.includes("*") || employee?.permissions.includes(permission as never)

  function startSession() {
    setState((current) => ({ ...initialState(current.planId, current.roleId), started: true }))
    showToast("Demo session started. Changes stay in this browser session only.")
  }

  function endSession() {
    window.sessionStorage.removeItem(storageKey)
    setState(initialState(state.planId, state.roleId))
    setAssistantAnswer("")
    showToast("Demo reset. No demo changes were saved anywhere.")
  }

  function updateProduct(productId: string, patch: Partial<DemoProduct>) {
    setState((current) => ({
      ...current,
      products: current.products.map((product) => {
        if (product.id !== productId) return product
        const next = { ...product, ...patch }
        next.onHand = next.frontStock + next.backStock
        next.status = next.onHand <= next.reorderPoint ? "Low" : next.onHand > next.par * 1.35 ? "Overstock" : "Healthy"
        return next
      })
    }))
    showToast("Demo item updated for this session only.")
  }

  function updatePolicy(policyId: string, patch: Partial<DemoPolicy>) {
    setState((current) => ({
      ...current,
      policies: current.policies.map((policy) => (policy.id === policyId ? { ...policy, ...patch } : policy))
    }))
    showToast("Demo document updated for this session only.")
  }

  function updateEmployee(employeeId: string, patch: Partial<DemoEmployee>) {
    setState((current) => ({
      ...current,
      employees: current.employees.map((person) => (person.id === employeeId ? { ...person, ...patch } : person))
    }))
    showToast("Demo employee updated for this session only.")
  }

  function renderActiveTab() {
    const tab = tabs.find((candidate) => candidate.id === state.activeTab) ?? tabs[0]
    if (!canUseFeature(tab.feature)) return <LockedPanel feature={tab.feature} planName={plan.name} />

    if (state.activeTab === "dashboard") {
      return (
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Demo products", state.products.length.toString(), "250 fake items across food, grocery, wine, household, and wellness"],
              ["Low stock", lowStock.toString(), "Items below reorder point"],
              ["Expiring soon", expiring.toString(), "Expiration-aware demo items due within 7 days"],
              ["Inventory value", money(inventoryValue), "Fake cost basis across demo on-hand counts"]
            ].map(([label, value, detail]) => (
              <section key={label} className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
                <p className="text-sm text-white/55">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
                <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>
              </section>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Attention queue</h2>
                <DemoPill>{plan.name} experience</DemoPill>
              </div>
              <div className="mt-4 grid gap-3">
                {state.products
                  .filter((product) => product.status !== "Healthy")
                  .slice(0, 6)
                  .map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(product.id)
                        setState((current) => ({ ...current, activeTab: "inventory" }))
                      }}
                      className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-blue-300/40"
                    >
                      <div>
                        <p className="font-semibold text-white">{product.name}</p>
                        <p className="mt-1 text-xs text-white/50">
                          {product.department} · {product.vendor} · {product.onHand} {product.unit}
                        </p>
                      </div>
                      <DemoPill className={statusTone(product.status)}>{product.status}</DemoPill>
                    </button>
                  ))}
              </div>
            </section>

            <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Shift notes summary</h2>
                <button
                  type="button"
                  className="rounded-md border border-white/15 px-3 py-1 text-xs font-semibold text-white/70"
                  onClick={() => {
                    setState((current) => ({ ...current, notes: [`Demo note ${current.notes.length + 1}: follow up on ${state.products[0]?.name}.`, ...current.notes] }))
                    showToast("Demo note created for this session only.")
                  }}
                >
                  New note
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">
                {state.notes.length} notes mention bakery markdowns, produce quality, and the wine feature. In the real app, visibility would follow organization,
                department, store, and individual sharing rules.
              </p>
              <div className="mt-3 grid gap-2">
                {state.notes.slice(0, 3).map((note) => (
                  <p key={note} className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-white/70">
                    {note}
                  </p>
                ))}
              </div>
            </section>
          </div>
        </div>
      )
    }

    if (state.activeTab === "inventory") {
      return (
        <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
          <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-white">Inventory sandbox</h2>
                <p className="mt-1 text-sm text-white/50">Showing {filteredProducts.length} of {state.products.length} fake products.</p>
              </div>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-white/12 bg-black/20 px-3 text-sm text-white/70">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search SKU, item, vendor..."
                  className="w-64 bg-transparent outline-none placeholder:text-white/35"
                />
              </label>
            </div>
            <div className="mt-4 overflow-hidden rounded-md border border-white/10">
              <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] bg-white/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                <span>Item</span>
                <span>Department</span>
                <span>On hand</span>
                <span>Status</span>
                <span>Price</span>
              </div>
              <div className="max-h-[620px] overflow-y-auto">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProductId(product.id)}
                    className={`grid w-full grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] items-center gap-3 border-t border-white/10 px-3 py-3 text-left text-sm transition hover:bg-white/[0.06] ${
                      selectedProduct?.id === product.id ? "bg-blue-400/10" : ""
                    }`}
                  >
                    <span>
                      <span className="block font-semibold text-white">{product.name}</span>
                      <span className="mt-1 block text-xs text-white/42">{product.sku} · {product.barcode}</span>
                    </span>
                    <span className="text-white/62">{product.department}</span>
                    <span className="text-white">{product.onHand} {product.unit}</span>
                    <span>
                      <DemoPill className={statusTone(product.status)}>{product.status}</DemoPill>
                    </span>
                    <span className="font-semibold text-white">{money(product.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
            <h2 className="font-semibold text-white">Item detail</h2>
            {selectedProduct ? (
              <div className="mt-4 grid gap-3">
                <div>
                  <p className="text-xl font-semibold text-white">{selectedProduct.name}</p>
                  <p className="mt-1 text-sm text-white/50">{selectedProduct.department} · {selectedProduct.category}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="text-white/55">
                    Front stock
                    <input
                      type="number"
                      value={selectedProduct.frontStock}
                      onChange={(event) => updateProduct(selectedProduct.id, { frontStock: Number(event.target.value) })}
                      disabled={!roleCan("inventory.edit")}
                      className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/20 px-3 text-white"
                    />
                  </label>
                  <label className="text-white/55">
                    Backstock
                    <input
                      type="number"
                      value={selectedProduct.backStock}
                      onChange={(event) => updateProduct(selectedProduct.id, { backStock: Number(event.target.value) })}
                      disabled={!roleCan("inventory.edit")}
                      className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/20 px-3 text-white"
                    />
                  </label>
                  <label className="text-white/55">
                    Par
                    <input
                      type="number"
                      value={selectedProduct.par}
                      onChange={(event) => updateProduct(selectedProduct.id, { par: Number(event.target.value) })}
                      disabled={!roleCan("inventory.edit")}
                      className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/20 px-3 text-white"
                    />
                  </label>
                  <label className="text-white/55">
                    Price
                    <input
                      type="number"
                      step="0.01"
                      value={selectedProduct.price}
                      onChange={(event) => updateProduct(selectedProduct.id, { price: Number(event.target.value) })}
                      disabled={!roleCan("inventory.edit")}
                      className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/20 px-3 text-white"
                    />
                  </label>
                </div>
                <label className="text-sm text-white/55">
                  Location
                  <input
                    value={selectedProduct.location}
                    onChange={(event) => updateProduct(selectedProduct.id, { location: event.target.value })}
                    disabled={!roleCan("inventory.edit")}
                    className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/20 px-3 text-white"
                  />
                </label>
                {selectedProduct.nutrition ? (
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm">
                    <p className="font-semibold text-white">Nutrition</p>
                    <p className="mt-1 text-white/60">
                      {selectedProduct.nutrition.caloriesKcal} calories per {selectedProduct.nutrition.servingSize}; {selectedProduct.nutrition.proteinG}g protein;{" "}
                      {selectedProduct.nutrition.sodiumMg}mg sodium.
                    </p>
                    <p className="mt-1 text-white/45">Ingredients: {selectedProduct.nutrition.ingredients}</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-white/55">No nutrition required for this demo product.</div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )
    }

    if (state.activeTab === "orders") {
      return (
        <div className="grid gap-4 lg:grid-cols-3">
          {state.orders.map((order) => (
            <section key={order.id} className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{order.vendor}</h2>
                  <p className="mt-1 text-sm text-white/50">Due in {order.dueInHours} hours</p>
                </div>
                <DemoPill className={statusTone(order.status)}>{order.status}</DemoPill>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-white/62">
                <p>Minimum: {money(order.minimum)}</p>
                <p>Draft total: {money(order.currentTotal)}</p>
                <p>{order.currentTotal >= order.minimum ? "Minimum reached" : `${money(order.minimum - order.currentTotal)} short of minimum`}</p>
              </div>
              <div className="mt-4 grid gap-3">
                {order.lines.map((line) => (
                  <div key={`${order.id}-${line.sku}`} className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-white">{line.itemName}</p>
                      <p className="text-sm text-white">{line.quantity}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/50">{line.reason}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={!roleCan("orders.edit")}
                onClick={() => showToast("Demo order draft saved for this session only.")}
                className="mt-4 min-h-10 w-full rounded-md border border-blue-300/40 bg-blue-400/15 text-sm font-semibold text-blue-100 disabled:opacity-50"
              >
                Save draft
              </button>
            </section>
          ))}
        </div>
      )
    }

    if (state.activeTab === "employees") {
      return (
        <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
          <h2 className="font-semibold text-white">Employee role simulation</h2>
          <p className="mt-1 text-sm text-white/50">Switch the active role in the header to see the workspace from another job title.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.employees.map((person) => (
              <div key={person.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{person.name}</p>
                    <p className="mt-1 text-xs text-white/45">{person.employeeId} · {person.department}</p>
                  </div>
                  <DemoPill>{person.status}</DemoPill>
                </div>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-white/40">
                  Job title
                  <input
                    value={person.title}
                    onChange={(event) => updateEmployee(person.id, { title: event.target.value })}
                    disabled={!roleCan("employees.edit")}
                    className="mt-1 h-9 w-full rounded-md border border-white/12 bg-black/20 px-2 text-sm normal-case tracking-normal text-white"
                  />
                </label>
                <p className="mt-2 text-xs leading-5 text-white/45">{person.permissions.includes("*") ? "All permissions" : `${person.permissions.length} permissions`}</p>
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (state.activeTab === "files") {
      return (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
            <h2 className="font-semibold text-white">Policies and how-tos</h2>
            <div className="mt-4 grid gap-3">
              {state.policies.map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => setSelectedPolicyId(policy.id)}
                  className={`rounded-md border p-3 text-left transition ${
                    selectedPolicy?.id === policy.id ? "border-blue-300/40 bg-blue-400/10" : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{policy.title}</p>
                    <DemoPill>{policy.type}</DemoPill>
                  </div>
                  <p className="mt-1 text-xs text-white/45">{policy.department} · opened {policy.openedCount} times</p>
                  <p className="mt-2 text-sm leading-5 text-white/58">{policy.summary}</p>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{selectedPolicy?.title}</h2>
                <p className="mt-1 text-sm text-white/45">{selectedPolicy?.category} · {selectedPolicy?.audience}</p>
              </div>
              <button
                type="button"
                onClick={() => selectedPolicy && updatePolicy(selectedPolicy.id, { favorite: !selectedPolicy.favorite })}
                className="rounded-md border border-white/15 px-3 py-1 text-xs font-semibold text-white/70"
              >
                {selectedPolicy?.favorite ? "Favorited" : "Favorite"}
              </button>
            </div>
            {selectedPolicy ? (
              <textarea
                value={selectedPolicy.body}
                onChange={(event) => updatePolicy(selectedPolicy.id, { body: event.target.value })}
                disabled={!roleCan("files.edit")}
                className="mt-4 min-h-80 w-full rounded-md border border-white/12 bg-black/20 p-3 text-sm leading-6 text-white outline-none"
              />
            ) : null}
          </section>
        </div>
      )
    }

    if (state.activeTab === "insights") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.insights.map((insight) => (
            <section key={insight.label} className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
              <DemoPill
                className={
                  insight.tone === "good"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : insight.tone === "risk"
                      ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                      : insight.tone === "watch"
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                        : "border-white/15 bg-white/10 text-white/70"
                }
              >
                {insight.tone}
              </DemoPill>
              <p className="mt-4 text-sm text-white/55">{insight.label}</p>
              <p className="mt-1 text-3xl font-semibold text-white">{insight.value}</p>
              <p className="mt-3 text-sm leading-6 text-white/58">{insight.detail}</p>
            </section>
          ))}
        </div>
      )
    }

    return (
      <section className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">Demo assistant</h2>
            <p className="mt-1 text-sm leading-6 text-white/55">
              This uses fake demo data only. The real assistant can use approved internal data, Open Food Facts, and OpenAI web search when configured.
            </p>
          </div>
          {canUseFeature("webEnrichment") ? <DemoPill className="border-blue-300/30 bg-blue-400/10 text-blue-100">Web enrichment preview</DemoPill> : null}
        </div>
        <textarea
          value={assistantQuestion}
          onChange={(event) => setAssistantQuestion(event.target.value)}
          className="mt-4 min-h-24 w-full rounded-md border border-white/12 bg-black/20 p-3 text-sm text-white outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {["How many calories are in the bread?", "Is Cabernet Sauvignon kosher?", "What should I order for berries?", "What is low stock?"].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setAssistantQuestion(prompt)
                setAssistantAnswer(answerDemoQuestion(prompt, state.products, canUseFeature("webEnrichment")))
              }}
              className="rounded-md border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70"
            >
              {prompt}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAssistantAnswer(answerDemoQuestion(assistantQuestion, state.products, canUseFeature("webEnrichment")))}
            className="rounded-md border border-blue-300/40 bg-blue-400/15 px-4 py-2 text-sm font-semibold text-blue-100"
          >
            Ask demo assistant
          </button>
        </div>
        {assistantAnswer ? (
          <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-white/78">{assistantAnswer}</p>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <main className="min-h-screen bg-[#061225] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.24),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(20,184,166,0.18),transparent_32%)]">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-[#0f172a]">
                  <Play className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#93c5fd]">Public demo</p>
                  <h1 className="text-3xl font-semibold tracking-tight">Try InvenTracker with fake data</h1>
                </div>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
                This sandbox includes 250 fake products, 20 fake employees, fake orders, fake policies, fake insights, and plan/role restrictions. It saves only
                to your browser session and never writes to Firebase.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:w-[520px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Experience plan
                <select
                  value={state.planId}
                  onChange={(event) => setState((current) => ({ ...current, planId: event.target.value as DemoPlanId }))}
                  className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/30 px-3 text-sm normal-case tracking-normal text-white"
                >
                  {demoPlans.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Experience role
                <select
                  value={state.roleId}
                  onChange={(event) => setState((current) => ({ ...current, roleId: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-md border border-white/12 bg-black/30 px-3 text-sm normal-case tracking-normal text-white"
                >
                  {state.employees.map((person) => (
                    <option key={person.id} value={person.id}>{person.title} · {person.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {!state.started ? (
            <div className="mt-8 rounded-panel border border-white/12 bg-white/[0.045] p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="text-xl font-semibold">Start a private demo session</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
                    You can edit inventory, employees, files, orders, and demo assistant prompts. The edits stay in this tab while the session is active, then reset
                    when you end the demo.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.features.map((feature) => (
                      <DemoPill key={feature}>{featureCopy(feature)}</DemoPill>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startSession}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-blue-300/40 bg-blue-400 px-5 text-sm font-semibold text-white shadow-lift transition hover:-translate-y-0.5"
                >
                  <Play className="h-4 w-4" />
                  Start demo session
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <DemoPill className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Session active
              </DemoPill>
              <DemoPill>{plan.name}</DemoPill>
              <DemoPill>
                <BriefcaseBusiness className="mr-1 inline h-3.5 w-3.5" />
                {employee?.title}
              </DemoPill>
              <DemoPill>
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                {employee?.permissions.includes("*") ? "All permissions" : `${employee?.permissions.length ?? 0} permissions`}
              </DemoPill>
              <button
                type="button"
                onClick={endSession}
                className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
                End and reset
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {state.started ? (
          <>
            <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const active = state.activeTab === tab.id
                const locked = !canUseFeature(tab.feature)
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setState((current) => ({ ...current, activeTab: tab.id }))}
                    className={`flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                      active ? "border-blue-300/50 bg-blue-400/20 text-white" : "border-white/12 bg-white/[0.035] text-white/58 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {locked ? <Lock className="h-3.5 w-3.5 text-amber-200" /> : null}
                  </button>
                )
              })}
            </nav>
            {renderActiveTab()}
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Private by design", "Demo edits live in browser session storage only. They are not written to Firebase."],
              ["Plan switching", "Preview Starter, Growth, Scale, and Enterprise feature access from the same screen."],
              ["Role switching", "Experience how the workspace changes for owners, managers, leads, clerks, and trainees."]
            ].map(([title, detail]) => (
              <section key={title} className="rounded-panel border border-white/12 bg-white/[0.045] p-4">
                <ClipboardList className="h-5 w-5 text-[#93c5fd]" />
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">{detail}</p>
              </section>
            ))}
          </div>
        )}
      </section>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border border-emerald-400/30 bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      ) : null}
    </main>
  )
}
