import fs from "node:fs/promises"
import path from "node:path"

import { run as run001 } from "./migrations/001_members_roles_normalization"
import { run as run002 } from "./migrations/002_regions_districts_stores_backfill"
import { run as run003 } from "./migrations/003_items_field_backfill"
import { run as run004 } from "./migrations/004_inventory_batches_store_scope"
import { run as run005 } from "./migrations/005_howto_steps_blocks_normalization"
import { run as run006 } from "./migrations/006_platform_preference_profiles_backfill"
import { run as run007 } from "./migrations/007_audit_logs_root_backfill"
import { run as run010 } from "./migrations/010_store_inventory_canonicalization"
import { run as run011 } from "./migrations/011_store_access_requests_bootstrap"
import { run as run012 } from "./migrations/012_store_inventory_unscoped_cleanup"
import { run as run013 } from "./migrations/013_item_submissions_bootstrap"
import { run as run014 } from "./migrations/014_recommendation_engine_bootstrap"
import { run as run015 } from "./migrations/015_recommendation_backend_source_enforcement"
import { run as run016 } from "./migrations/016_department_configs_backfill"

const registryPath = path.resolve("/Users/ianjent/Desktop/InvenTracker/meta/migrations/registry.json")

type Registry = { applied: string[] }

const ordered = [run001, run002, run003, run004, run005, run006, run007, run010, run011, run012, run013, run014, run015, run016]

async function readRegistry(): Promise<Registry> {
  try {
    const text = await fs.readFile(registryPath, "utf8")
    return JSON.parse(text) as Registry
  } catch {
    return { applied: [] }
  }
}

async function writeRegistry(registry: Registry) {
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8")
}

async function main() {
  const registry = await readRegistry()
  for (const migration of ordered) {
    const result = await migration()
    if (!registry.applied.includes(result.id)) {
      registry.applied.push(result.id)
    }
    console.log(`\n[${result.id}] scanned=${result.scanned} updated=${result.updated} skipped=${result.skipped}`)
    result.notes.forEach((note) => console.log(`- ${note}`))
  }
  await writeRegistry(registry)
  console.log("\nMigrations complete.")
}

void main()
