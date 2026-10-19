import { writeFileSync } from "node:fs"
import { migrateLegacyWidgetIds } from "../src/lib/workspace-registry.ts"
import { legacyWidgetDefinitions } from "../src/lib/workspace-legacy-adapter.ts"
import { packWidgets, compactWidgets, snapWidgetSize } from "../src/lib/workspace-grid.ts"
import type { DeviceClass, WidgetInstance, WidgetSize } from "../src/lib/workspace-contracts.ts"
const now="2026-10-18T20:00:00.000Z"
const seed=migrateLegacyWidgetIds({ids:["inventory","orders","low-stock","health"],definitions:legacyWidgetDefinitions,userId:"native-fixture-user",organizationId:"native-fixture-org",deviceClass:"phone",now}).layout
const sizes:WidgetSize[]=["small","medium","large","extra-large"]
const cases=[]
for(const device of ["phone","tablet","desktop"] as DeviceClass[])for(let scenario=0;scenario<40;scenario++){
 const input=Array.from({length:8},(_,i)=>({...seed.widgets[i%seed.widgets.length],id:`w-${i}`,size:sizes[(i+scenario)%4],gridX:scenario===38?-7:(i*3+scenario)%13,gridY:((i*5+scenario)%9)+(scenario===39?600:0)})) as WidgetInstance[]
 const active=input[scenario%input.length].id
 const packed=packWidgets(input,device,active)
 cases.push({device,input,active,packed,compacted:compactWidgets(packed,device),snap:snapWidgetSize((scenario%12)+0.4,(scenario%7)+0.2,sizes,device),width:(scenario%12)+0.4,height:(scenario%7)+0.2})
}
const catalog={schemaVersion:"1",definitions:legacyWidgetDefinitions.map(d=>({...d,href:"/inventory"})),seedLayout:seed,defaultLayout:seed,unresolvedIds:[]}
writeFileSync("fixtures/engine-contracts/workspace-v1.json", '{\n  "catalog": '+JSON.stringify(catalog)+',\n  "cases": [\n'+cases.map(item=>'    '+JSON.stringify(item)).join(',\n')+'\n  ]\n}\n')
console.log("Wrote shared workspace fixture: 120 geometry scenarios across phone/tablet/desktop.")
