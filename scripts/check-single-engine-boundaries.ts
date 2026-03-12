import { execFileSync } from "node:child_process"

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
    "apps/web/src",
    "InstaTracker",
    "functions/src",
    "packages/shared/src",
    "scripts"
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
          file: line.slice(0, first),
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
    if (maybeStatus === 1 || message.includes("status 1")) return []
    throw error
  }
}

function isAllowed(file: string, allowFiles: RegExp[]): boolean {
  return allowFiles.some((rule) => rule.test(file))
}

function main() {
  const violations: string[] = []

  for (const check of checks) {
    const matches = runRipgrep(check.pattern)
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
