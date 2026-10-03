import fs from 'node:fs/promises'

const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN
if (!accessToken) throw new Error('Set GOOGLE_OAUTH_ACCESS_TOKEN to a Google OAuth access token with Firestore access.')
const projectId = 'inventracker-f1229'
const orgId = 'demo-org'
const storeId = 'Thev6hRLBvEFZnpf18PU'
const database = `projects/${projectId}/databases/(default)/documents`
const source = new URL('../data/imports/tfm-266-specialty-cheese-2026-04-24/final-products.json', import.meta.url)
const products = JSON.parse(await fs.readFile(source, 'utf8'))

function value(input) {
  if (input === null) return { nullValue: null }
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } }
  switch (typeof input) {
    case 'boolean': return { booleanValue: input }
    case 'number': return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input }
    case 'string': return { stringValue: input }
    case 'object': return { mapValue: { fields: Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, value(entry)])) } }
    default: throw new Error(`Unsupported Firestore value: ${typeof input}`)
  }
}

const selectedFields = ['nutrition', 'images', 'hasNutritionInfo', 'variableMeasure', 'sourceEvidence', 'webResearch', 'sourcePageReverifiedAt', 'enrichmentStatus', 'schemaVersion']
const writes = []
for (const product of products) {
  const fields = Object.fromEntries(selectedFields.filter((key) => product.common[key] !== undefined).map((key) => [key, value(product.common[key])]))
  const updateMask = { fieldPaths: Object.keys(fields) }
  const paths = [
    `centralCatalog/${product.centralId}`,
    `orgs/${orgId}/products/${product.orgProductId}`,
    `orgs/${orgId}/stores/${storeId}/productDetails/${product.orgProductId}`,
    `orgs/${orgId}/inventory/${product.inventoryId}`
  ]
  paths.forEach((path) => writes.push({ update: { name: `${database}/${path}`, fields }, updateMask }))
}
for (let index = 0; index < writes.length; index += 400) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${database}:batchWrite`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: writes.slice(index, index + 400) })
  })
  if (!response.ok) throw new Error(`Firestore batch ${index / 400 + 1} failed: ${response.status} ${await response.text()}`)
  const result = await response.json()
  const failed = (result.status ?? []).filter((status) => status.code && status.code !== 0)
  if (failed.length) throw new Error(`Firestore batch ${index / 400 + 1} had ${failed.length} write errors: ${JSON.stringify(failed.slice(0, 3))}`)
  console.log(`Published ${Math.min(index + 400, writes.length)} / ${writes.length} enrichment updates`)
}
console.log(JSON.stringify({ products: products.length, writes: writes.length, storeId }, null, 2))
