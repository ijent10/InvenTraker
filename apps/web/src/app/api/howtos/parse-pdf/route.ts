import { NextResponse } from "next/server"
import pdfParse from "pdf-parse"

import { buildHowToDraftFromText } from "@/lib/howto-draft-parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          fallback: true,
          reason: "No PDF file was provided.",
          steps: []
        },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const parsed = await pdfParse(buffer)
    const draft = buildHowToDraftFromText(parsed.text ?? "", parsed.info?.Title)

    if (!draft.steps.length || (draft.steps.length === 1 && /No text extracted from PDF/i.test(draft.steps[0]?.blocks[0]?.text ?? ""))) {
      return NextResponse.json(
        {
          ok: false,
          fallback: true,
          reason: "Couldn’t parse PDF—create manually.",
          steps: []
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ok: true,
      fallback: false,
      suggestedTitle: draft.title,
      steps: draft.steps
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        fallback: true,
        reason: "Couldn’t parse PDF—create manually.",
        steps: []
      },
      { status: 500 }
    )
  }
}
