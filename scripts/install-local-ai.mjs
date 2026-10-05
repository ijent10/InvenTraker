import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const expected = "7888de3385a567fcc971a6bbecbdd77862b8a4a6bf911a13560420ea577fe8fe"
const modelPath = process.env.INVENTRAKER_GGUF_PATH || "/Users/ian/.unsloth/studio/exports/unsloth_Qwen3-0.6B_1791144267-GGUF/Qwen3-0.6B.Q5_K_M.gguf"
const bytes = await readFile(modelPath)
const actual = createHash("sha256").update(bytes).digest("hex")
if (actual !== expected) throw new Error(`Model checksum mismatch: expected ${expected}, received ${actual}`)
const directory = await mkdtemp(join(tmpdir(), "inventracker-ai-"))
const modelfile = join(directory, "Modelfile")
await writeFile(modelfile, `FROM ${modelPath}\nPARAMETER temperature 0\nPARAMETER seed 42\nPARAMETER num_ctx 8192\n`)
const result = spawnSync("ollama", ["create", "inventracker-qwen3:0.6b-q5km", "-f", modelfile], { stdio: "inherit" })
await rm(directory, { recursive: true, force: true })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`Installed pinned local model (${actual.slice(0, 12)}…).`)
