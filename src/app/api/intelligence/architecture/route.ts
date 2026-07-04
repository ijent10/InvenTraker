import { NextResponse } from "next/server"

import { retailIntelligenceArchitecture } from "@/lib/intelligence/architecture"

export async function GET() {
  return NextResponse.json(retailIntelligenceArchitecture)
}
