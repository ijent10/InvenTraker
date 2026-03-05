import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const webNextDir = path.join(root, "apps", "web", ".next")
const rootNextDir = path.join(root, ".next")

if (!fs.existsSync(webNextDir)) {
  throw new Error(`Missing web build output at ${webNextDir}. Run web build first.`)
}

fs.rmSync(rootNextDir, { recursive: true, force: true })
fs.mkdirSync(rootNextDir, { recursive: true })
fs.cpSync(webNextDir, rootNextDir, { recursive: true })

const standaloneAppDir = path.join(rootNextDir, "standalone", "apps", "web")
const standaloneCompatDotNext = path.join(rootNextDir, "standalone", ".next")
const nestedDotNext = path.join(standaloneAppDir, ".next")
const nestedServer = path.join(standaloneAppDir, "server.js")
const standaloneServer = path.join(rootNextDir, "standalone", "server.js")

if (fs.existsSync(nestedDotNext)) {
  fs.mkdirSync(standaloneCompatDotNext, { recursive: true })
  fs.cpSync(nestedDotNext, standaloneCompatDotNext, { recursive: true })
}

if (fs.existsSync(nestedServer) && !fs.existsSync(standaloneServer)) {
  fs.copyFileSync(nestedServer, standaloneServer)
}

const expectedManifest = path.join(rootNextDir, "standalone", ".next", "routes-manifest.json")
if (!fs.existsSync(expectedManifest)) {
  throw new Error(`App Hosting compatibility manifest missing at ${expectedManifest}`)
}

console.log(`[apphosting] prepared artifacts at ${rootNextDir}`)
console.log(`[apphosting] verified ${expectedManifest}`)
