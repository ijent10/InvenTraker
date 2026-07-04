import { NextResponse } from "next/server"

import { generateBusinessRecommendations } from "@/lib/intelligence/recommendations"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const orgId = url.searchParams.get("orgId") ?? undefined
  const result = await generateBusinessRecommendations({ orgId })

  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const orgId = typeof body?.orgId === "string" ? body.orgId : undefined
  const result = await generateBusinessRecommendations({ orgId })

  return NextResponse.json(result)
}
