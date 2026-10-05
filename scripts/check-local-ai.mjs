const base = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "")
const model = process.env.OLLAMA_MODEL || "inventracker-qwen3:0.6b-q5km"
const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  model, stream: false, think: false, format: { type: "object", additionalProperties: false, required: ["selected"], properties: { selected: { type: "array", items: { type: "string" } } } },
  options: { temperature: 0, seed: 42 }, messages: [{ role: "system", content: "Select only supplied IDs and return JSON." }, { role: "user", content: JSON.stringify({ candidates: [{ id: "critical-stockout", severity: "critical" }, { id: "routine-count", severity: "low" }] }) }]
}) })
if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`)
const payload = await response.json()
const parsed = JSON.parse(payload.message.content)
if (!Array.isArray(parsed.selected) || !parsed.selected.every((id) => ["critical-stockout", "routine-count"].includes(id))) throw new Error("Local model did not return the required grounded schema.")
console.log(`Local AI check passed with ${model}: ${parsed.selected.join(", ")}`)
