import { execFileSync, spawnSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

type BoundaryCheck = {
  label: string
  pattern: string
  allowFiles: RegExp[]
}

const checks: BoundaryCheck[] = [
  {
    label: "iOS direct local order recommendation math",
    pattern: "OrderRecommendationEngine\\.calculate\\(",
    allowFiles: [/^InstaTracker\/Services\/RecommendationFallbackService\.swift$/]
  },
  {
    label: "ProductionPlanningService usage",
    pattern: "ProductionPlanningService\\.",
    allowFiles: [/^InstaTracker\/Services\/RecommendationFallbackService\.swift$/]
  },
  {
    label: "Web makeTodaySuggestions usage",
    pattern: "makeTodaySuggestions\\(",
    allowFiles: [
      /^apps\/web\/src\/lib\/recommendations\/fallback\.ts$/,
      /^apps\/web\/src\/lib\/production\/planning\.ts$/
    ]
  },
  {
    label: "Web generateFrozenPullRows usage",
    pattern: "generateFrozenPullRows\\(",
    allowFiles: [
      /^apps\/web\/src\/lib\/recommendations\/fallback\.ts$/,
      /^apps\/web\/src\/lib\/production\/planning\.ts$/
    ]
  }
]

type Match = {
  file: string
  line: string
  content: string
}

const searchRoots = [
  "apps/web/src",
  "../InstaTracker",
  "InstaTracker",
  "functions/src",
  "packages/shared/src",
  "scripts"
]

const excludedPathFragments = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}functions${path.sep}lib${path.sep}`
]

function hasRipgrep(): boolean {
  const probe = spawnSync("rg", ["--version"], {
    stdio: "ignore"
  })
  if (probe.error) return false
  return probe.status === 0
}

function shouldSkipPath(absolutePath: string): boolean {
  return excludedPathFragments.some((fragment) => absolutePath.includes(fragment))
}

function existingSearchRoots(): string[] {
  return searchRoots.filter((root) => statSync(path.resolve(root), { throwIfNoEntry: false })?.isDirectory())
}

function normalizeMatchFile(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\.\//, "")
}

function collectFiles(root: string): string[] {
  const absoluteRoot = path.resolve(root)
  if (!statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) return []

  const results: string[] = []
  const queue = [absoluteRoot]
  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue
    if (shouldSkipPath(current)) continue

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name)
      if (shouldSkipPath(next)) continue
      if (entry.isDirectory()) {
        queue.push(next)
      } else if (entry.isFile()) {
        results.push(next)
      }
    }
  }

  return results
}

function runFilesystemScan(pattern: string): Match[] {
  const expression = new RegExp(pattern)
  const files = existingSearchRoots().flatMap((root) => collectFiles(root))
  const matches: Match[] = []

  for (const absoluteFilePath of files) {
    let content = ""
    try {
      content = readFileSync(absoluteFilePath, "utf8")
    } catch {
      continue
    }

    const lines = content.split("\n")
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ""
      if (!expression.test(line)) continue
      matches.push({
        file: normalizeMatchFile(path.relative(process.cwd(), absoluteFilePath)),
        line: String(index + 1),
        content: line.trim()
      })
    }
  }

  return matches
}

function runRipgrep(pattern: string): Match[] {
  const args = [
    "--line-number",
    "--no-heading",
    "--color=never",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.next/**",
    "--glob",
    "!**/functions/lib/**",
    pattern,
    ...existingSearchRoots()
  ]

  try {
    const output = execFileSync("rg", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim()
    if (!output) return []
    return output
      .split("\n")
      .map((line) => {
        const first = line.indexOf(":")
        const second = line.indexOf(":", first + 1)
        if (first <= 0 || second <= first + 1) return null
        return {
          file: normalizeMatchFile(line.slice(0, first)),
          line: line.slice(first + 1, second),
          content: line.slice(second + 1).trim()
        } satisfies Match
      })
      .filter((row): row is Match => Boolean(row))
  } catch (error) {
    const maybeStatus =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : null
    const message = String(error)
    const isMissingBinary = message.includes("ENOENT") || message.includes("spawnSync rg")
    if (isMissingBinary) {
      return runFilesystemScan(pattern)
    }
    if (maybeStatus === 1 || message.includes("status 1")) return []
    throw error
  }
}

function isAllowed(file: string, allowFiles: RegExp[]): boolean {
  return allowFiles.some((rule) => rule.test(file))
}

function main() {
  const violations: string[] = []

  const ripgrepAvailable = hasRipgrep()
  if (!ripgrepAvailable) {
    console.warn("[single-engine-boundary] rg not found; using filesystem fallback scan.")
  }

  for (const check of checks) {
    const matches = ripgrepAvailable ? runRipgrep(check.pattern) : runFilesystemScan(check.pattern)
    for (const match of matches) {
      if (isAllowed(match.file, check.allowFiles)) continue
      violations.push(`${check.label}: ${match.file}:${match.line} -> ${match.content}`)
    }
  }

  if (violations.length > 0) {
    console.error("[single-engine-boundary] Found forbidden recommendation logic usage:")
    violations.forEach((line) => console.error(`- ${line}`))
    process.exit(1)
  }

  console.log("[single-engine-boundary] OK")
}

main()
