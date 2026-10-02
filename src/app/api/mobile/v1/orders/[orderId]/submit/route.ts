export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  return Response.json({
    error: {
      code: "order_transition_required",
      message: "Approve the order, then record its submission method through the order transition workflow."
    }
  }, { status: 409 })
}
