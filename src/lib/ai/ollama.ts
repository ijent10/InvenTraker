import { z } from "zod"

export const LOCAL_AI_MODEL = process.env.OLLAMA_MODEL || "inventracker-qwen3:0.6b-q5km"
export const LOCAL_AI_PROMPT_VERSION = "inventracker-operations-2026-10-04.1"

function baseUrl() {
  return (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "")
}

export function localAiEnabled() {
  return (process.env.AI_MODEL_PROVIDER || "ollama") === "ollama"
}

export async function askOllamaJson<T extends z.ZodTypeAny>({
  system,
  input,
  schema,
  jsonSchema
}: {
  system: string
  input: unknown
  schema: T
  jsonSchema: Record<string, unknown>
}): Promise<{ data: z.output<T>; model: string; promptVersion: string } | null> {
  if (!localAiEnabled()) return null
  try {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_AI_MODEL,
        stream: false,
        think: false,
        format: jsonSchema,
        options: {
          temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0),
          seed: Number(process.env.OLLAMA_SEED ?? 42),
          num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 8192)
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ promptVersion: LOCAL_AI_PROMPT_VERSION, ...input as object }) }
        ]
      }),
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000))
    })
    if (!response.ok) return null
    const payload = await response.json()
    const raw = payload?.message?.content
    if (typeof raw !== "string") return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? { data: parsed.data, model: LOCAL_AI_MODEL, promptVersion: LOCAL_AI_PROMPT_VERSION } : null
  } catch {
    return null
  }
}
