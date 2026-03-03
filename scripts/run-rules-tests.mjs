import { execSync } from "node:child_process"

function hasJava() {
  try {
    execSync("java -version", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

if (!hasJava()) {
  console.warn("[test:rules] Java runtime not found. Skipping Firestore rules tests.")
  process.exit(0)
}

execSync("npm run test:rules --workspace @inventracker/firebase-tools", { stdio: "inherit" })
