import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { runOpenFoodFactsImport, type ImportOptions } from "../src/lib/open-food-facts-import.ts"

function argument(name: string) {
  const prefix = `--${name}=`
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length)
}

const mode = (argument("mode") ?? "validation") as ImportOptions["mode"]
if (!["probe", "validation", "full", "incremental"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`)
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID
const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const result = await runOpenFoodFactsImport(getFirestore(app), {
  mode,
  runId: argument("run-id"),
  maxAccepted: argument("max-accepted") ? Number(argument("max-accepted")) : undefined,
  maxScanned: argument("max-scanned") ? Number(argument("max-scanned")) : undefined,
  resumeAfter: argument("resume-after") ? Number(argument("resume-after")) : undefined,
  modifiedAfter: argument("modified-after") ? Number(argument("modified-after")) : undefined
})
console.log(JSON.stringify(result, null, 2))
