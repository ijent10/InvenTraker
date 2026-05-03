import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const webNextDir = path.join(root, "apps", "web", ".next")
const webPublicDir = path.join(root, "apps", "web", "public")
const rootNextDir = path.join(root, ".next")

if (!fs.existsSync(webNextDir)) {
  throw new Error(`Missing web build output at ${webNextDir}. Run web build first.`)
}

fs.rmSync(rootNextDir, { recursive: true, force: true })
fs.mkdirSync(rootNextDir, { recursive: true })
fs.cpSync(webNextDir, rootNextDir, { recursive: true })

const standaloneAppDir = path.join(rootNextDir, "standalone", "apps", "web")
const standaloneRoot = path.join(rootNextDir, "standalone")
const standaloneCompatDotNext = path.join(rootNextDir, "standalone", ".next")
const nestedDotNext = path.join(standaloneAppDir, ".next")
const nestedServer = path.join(standaloneAppDir, "server.js")
const standaloneServer = path.join(rootNextDir, "standalone", "server.js")
const webStaticDir = path.join(rootNextDir, "static")
const standaloneStaticDir = path.join(standaloneCompatDotNext, "static")

if (fs.existsSync(nestedDotNext)) {
  fs.mkdirSync(standaloneCompatDotNext, { recursive: true })
  fs.cpSync(nestedDotNext, standaloneCompatDotNext, { recursive: true })
}

if (fs.existsSync(webStaticDir)) {
  fs.mkdirSync(standaloneStaticDir, { recursive: true })
  fs.cpSync(webStaticDir, standaloneStaticDir, { recursive: true })
}

if (fs.existsSync(nestedServer) && !fs.existsSync(standaloneServer)) {
  fs.copyFileSync(nestedServer, standaloneServer)
}

if (fs.existsSync(webPublicDir)) {
  const publicTargets = [
    path.join(root, "public"),
    path.join(rootNextDir, "public"),
    path.join(standaloneRoot, "public"),
    path.join(standaloneAppDir, "public")
  ]
  for (const target of publicTargets) {
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    fs.cpSync(webPublicDir, target, { recursive: true })
  }
}

const expectedManifest = path.join(rootNextDir, "standalone", ".next", "routes-manifest.json")
if (!fs.existsSync(expectedManifest)) {
  throw new Error(`App Hosting compatibility manifest missing at ${expectedManifest}`)
}

console.log(`[apphosting] prepared artifacts at ${rootNextDir}`)
console.log(`[apphosting] verified ${expectedManifest}`)
