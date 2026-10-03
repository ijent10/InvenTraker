import fs from 'node:fs/promises'

const projectId = 'inventracker-f1229'
const orgId = 'demo-org'
const storeId = 'Thev6hRLBvEFZnpf18PU'
const root = new URL('../data/imports/tfm-266-specialty-cheese-2026-04-24/', import.meta.url)
const products = JSON.parse(await fs.readFile(new URL('source-products.json', root), 'utf8'))
const off = JSON.parse(await fs.readFile(new URL('open-food-facts-matches.json', root), 'utf8'))
const importedAt = new Date().toISOString()

const manualPages = {
  '00736436500370': 2, '00092227727129': 3, '00853099004035': 4, '00853099004028': 4,
  '00031142601527': 4, '00054783831481': 5, '09317320100053': 6, '00195463000077': 7,
  '00761657908148': 7, '00039496001116': 7, '00201969000005': 7
}
function category(name) {
  const n = name.toLowerCase()
  if (/hummus|tzatziki|dip|spread|pimento/.test(n)) return 'Dips & Spreads'
  if (/salami|prosciutto|sopress|pepperoni|mortadella|ham|turkey|roast beef|sausage|frank|kielbasa|hot dog|pate|mousse|chorizo|liverwurst|teawurst/.test(n)) return 'Charcuterie & Deli Meat'
  if (/pickle/.test(n)) return 'Pickles'
  if (/crisp|cracker/.test(n)) return 'Cheese Accompaniments'
  return 'Specialty Cheese'
}
function variable(gtin) {
  const upc = gtin.replace(/^00/, '')
  if (!/^2\d{11}$/.test(upc)) return null
  return { isVariableMeasure: true, symbology: 'UPC-A Type 2 / RCN-12', rcnPrefix: upc[0], itemReference: upc.slice(1, 6), lookupPrefix: upc.slice(0, 6), priceVerifierDigitPosition: 7, embeddedPriceDigits: 4, encodedValue: 'price', placeholderBarcode: gtin }
}
function num(n, ...keys) { for (const k of keys) { const v = Number(n?.[k]); if (Number.isFinite(v)) return v } }
function nutrition(p) {
  if (!p) return undefined
  const n=p.nutriments||{}
  const value = {
    servingSize: p.serving_size || undefined,
    caloriesKcal: num(n,'energy-kcal_serving','energy-kcal_100g'),
    fatG: num(n,'fat_serving','fat_100g'), saturatedFatG: num(n,'saturated-fat_serving','saturated-fat_100g'),
    carbohydratesG: num(n,'carbohydrates_serving','carbohydrates_100g'), sugarsG: num(n,'sugars_serving','sugars_100g'),
    fiberG: num(n,'fiber_serving','fiber_100g'), proteinG: num(n,'proteins_serving','proteins_100g'),
    sodiumMg: (()=>{const v=num(n,'sodium_serving','sodium_100g');return v===undefined?undefined:Math.round(v*1000)})(),
    saltG: num(n,'salt_serving','salt_100g'), ingredientsText: p.ingredients_text || undefined,
    allergens: Array.isArray(p.allergens_tags) ? p.allergens_tags.map(x=>x.replace(/^en:/,'')).join(', ') : p.allergens || undefined,
    labels: Array.isArray(p.labels_tags) ? p.labels_tags.map(x=>x.replace(/^en:/,'')).join(', ') : p.labels || undefined,
    imageUrl: p.image_front_url || p.image_url || undefined,
    sourceSummary: 'Exact barcode match from Open Food Facts; review against the physical package before operational use.'
  }
  return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&v!==''))
}
function compact(v) {
  if (Array.isArray(v)) return v.map(compact).filter(x=>x!==undefined)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,compact(x)]).filter(([,x])=>x!==undefined))
  return v===undefined ? undefined : v
}
const prepared = products.map(row => {
  const gtin=row.gtin, source=off[gtin], vm=variable(gtin), page=row.page||manualPages[gtin]
  const section=page ? page-1 : null
  const images=[source?.image_front_url||source?.image_url].filter(Boolean)
  const nut=nutrition(source)
  const common=compact({name:row.name,sku:gtin,barcode:gtin,department:'Deli',category:category(row.name),defaultUnit:vm?'pounds':'eaches',expires:true,images,nutrition:nut,hasNutritionInfo:Boolean(nut),variableMeasure:vm||{isVariableMeasure:false},planogram:{name:'5 Deck 24 ft Charcuterie and Artisan Cheese Wall',section,sourceDate:'2026-04-24'},sourceEvidence:[{source:'retail-planogram',document:'5 Deck 24 ft Charcuterie and Artisan Cheese Wall Planogram',page,verifiedIdentity:true},...(source?[{source:'Open Food Facts',url:`https://world.openfoodfacts.org/product/${gtin}`,exactBarcodeMatch:true,verifiedAt:importedAt}]:[])],enrichmentStatus:source?'exact_barcode_match':'identity_imported_source_data_pending',searchText:`${row.name} ${gtin}`.toLowerCase(),schemaVersion:2,updatedAt:importedAt})
  const centralId=`central-${gtin}`, orgProductId=`product-${gtin}`, inventoryId=`inventory-${gtin}`
  return {gtin,centralId,orgProductId,inventoryId,common,location:`Specialty wall${section?` · section ${section} of 6`:''}`,exactEnrichment:Boolean(source)}
})
const report={store:{id:storeId,code:'266',name:'The Fresh Market — Pittsburgh #266',address:'5880 Centre Ave., Pittsburgh, PA 15206',phone:'412-704-6014'},sourceDocument:'5 Deck 24 ft Charcuterie and Artisan Cheese Wall Planogram',sourceDate:'2026-04-24',preparedAt:importedAt,uniqueProducts:prepared.length,variableMeasureProducts:prepared.filter(x=>x.common.variableMeasure.isVariableMeasure).length,exactBarcodeEnrichments:prepared.filter(x=>x.exactEnrichment).length,pendingSourceEnrichments:prepared.filter(x=>!x.exactEnrichment).length,writePlan:{centralCatalog:prepared.length,organizationProducts:prepared.length,storeProductDetails:prepared.length,inventory:prepared.length}}
await fs.writeFile(new URL('prepared-products.json',root),JSON.stringify(prepared,null,2)+'\n')
await fs.writeFile(new URL('import-report.json',root),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
