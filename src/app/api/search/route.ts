import { NextResponse } from "next/server"

import { navigation } from "@/lib/navigation"
import {
  getEmployees,
  getHealthChecks,
  getHistoryRecords,
  getInventoryItems,
  getOrderDrafts,
  getProducts,
  getStores,
  getVendors
} from "@/lib/server-data"

type SearchResult = {
  id: string
  title: string
  subtitle: string
  type: string
  href: string
  keywords: string[]
}

export const dynamic = "force-dynamic"

function includesQuery(result: SearchResult, query: string) {
  const searchableText = [result.title, result.subtitle, result.type, ...result.keywords].join(" ").toLowerCase()
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => searchableText.includes(part))
}

function pageResults(): SearchResult[] {
  return navigation.map((item) => ({
    id: `page-${item.href}`,
    title: item.label,
    subtitle: "Open workspace page",
    type: "Page",
    href: item.href,
    keywords: [item.href.replace("/", " "), item.label]
  }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")?.trim().toLowerCase() ?? ""

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const [inventoryItems, products, vendors, orders, employees, stores, healthChecks, historyRecords] = await Promise.all([
    getInventoryItems(),
    getProducts(),
    getVendors(),
    getOrderDrafts(),
    getEmployees(),
    getStores(),
    getHealthChecks(),
    getHistoryRecords()
  ])

  const results: SearchResult[] = [
    ...pageResults(),
    ...inventoryItems.map((item) => ({
      id: `inventory-${item.id}`,
      title: item.name,
      subtitle: `${item.sku} · ${item.department} · ${item.location}`,
      type: "Inventory",
      href: `/inventory/${item.id}`,
      keywords: [item.category, item.vendor, item.status, item.unit]
    })),
    ...products.map((product) => ({
      id: `product-${product.id}`,
      title: product.name,
      subtitle: `${product.sku ?? "No SKU"} · ${product.department} · ${product.category}`,
      type: "Inventory Catalog",
      href: `/products/${product.id}`,
      keywords: [product.defaultUnit, product.location, product.expires ? "expires" : "no expiration"]
    })),
    ...vendors.map((vendor) => ({
      id: `vendor-${vendor.id}`,
      title: vendor.name,
      subtitle: `${vendor.leadTime} lead time · ${vendor.minimum} minimum`,
      type: "Vendor",
      href: "/stores",
      keywords: [vendor.contact]
    })),
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      title: order.vendor,
      subtitle: `${order.items} items · ${order.estimatedTotal} · ${order.status}`,
      type: "Order",
      href: "/orders",
      keywords: [order.dueBy]
    })),
    ...employees.map((employee) => ({
      id: `employee-${employee.id}`,
      title: employee.name,
      subtitle: `${employee.employeeId} · ${employee.jobTitle} · ${employee.location}`,
      type: "Employee",
      href: "/employees",
      keywords: [employee.email, employee.phone, employee.department, employee.store, employee.status]
    })),
    ...stores.map((store) => ({
      id: `store-${store.id}`,
      title: store.name,
      subtitle: `${store.code} · ${store.manager} · ${store.address}`,
      type: "Store",
      href: "/stores",
      keywords: [store.phone, ...store.editableAreas]
    })),
    ...healthChecks.map((check) => ({
      id: `health-${check.id}`,
      title: check.name,
      subtitle: `${check.store} · ${check.schedule} · ${check.status}`,
      type: "Health Check",
      href: "/health-checks",
      keywords: [check.completedBy, check.lastCompleted]
    })),
    ...historyRecords.map((record) => ({
      id: `history-${record.id}`,
      title: record.label,
      subtitle: `${record.userName} · ${record.date} ${record.time}`,
      type: "History",
      href: `/history/${record.type}`,
      keywords: [record.employeeId, record.department, record.title, record.store, record.summary]
    }))
  ]

  return NextResponse.json({
    results: results.filter((result) => includesQuery(result, query)).slice(0, 10)
  })
}
