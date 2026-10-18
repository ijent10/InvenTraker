import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {initializeApp,applicationDefault} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'
import {handleStockTransfer} from '../src/lib/engines/inventory/transfer-http.ts'
import {handleSpotCheck} from '../src/lib/engines/inventory/spot-check-http.ts'
import {handleReceiving} from '../src/lib/engines/inventory/receiving-http.ts'
import {handleRestock} from '../src/lib/engines/inventory/restock-http.ts'
import {handleDiscard} from '../src/lib/engines/inventory/discard-http.ts'
import {handlePortion} from '../src/lib/engines/inventory/portion-http.ts'
import {handleThresholdChange} from '../src/lib/engines/inventory/threshold-http.ts'
if (process.env.INVENTRAKER_RUN_FIRESTORE_INTEGRATION !== "1" || process.env.INVENTORY_WRITES_ENABLED !== "false") throw new Error("Set INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 and INVENTORY_WRITES_ENABLED=false for isolated write-pause checks.")
const org='east-liberty-market-group',store='east-liberty-main',item='pause-check-'+randomUUID()
const credentials=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'market.owner@inventraker.app',password:'MarketOwner2026!',returnSecureToken:true})}).then(r=>r.json())
assert.ok(credentials.idToken)
const db=getFirestore(initializeApp({credential:applicationDefault(),projectId:'inventracker-f1229'})),ref=db.collection('orgs').doc(org).collection('inventory').doc(item)
await ref.set({storeId:store,name:'Internal write-pause check',frontStock:3,backStock:4,onHand:7,revision:0,par:10,reorderPoint:2,unit:'eaches',status:'Active'})
const before=await ref.get(),ids:string[]=[]
function request(body:unknown){return new Request('http://localhost/action',{method:'POST',headers:{authorization:`Bearer ${credentials.idToken}`,'x-inventracker-org':org,'content-type':'application/json'},body:JSON.stringify(body)})}
try{
 const lines=[{itemId:item,expectedRevision:0,frontStock:3,backStock:4}]
 const cases:[string,(r:Request,f:'mobile'|'engine')=>Promise<Response>,Record<string,unknown>][]=[
 ['transfer',handleStockTransfer,{itemId:item,quantity:1,source:'back',destination:'front'}],['count',handleSpotCheck,{lines}],['receive',handleReceiving,{lines:[{itemId:item,quantity:1}]}],['restock',handleRestock,{commit:true,lines:[{itemId:item,countedFrontStock:3,expectedRevision:0}]}],['discard',handleDiscard,{lines:[{itemId:item,area:'back',quantity:1,reason:'Internal check'}]}],['portion',handlePortion,{itemId:item,sourceArea:'back',portionWeight:1,portionCount:1}],['threshold',handleThresholdChange,{itemId:item,expectedRevision:0,par:10,reorderPoint:2,reason:'Internal check'}]]
 for(const [name,handler,payload]of cases)for(const format of ['engine','mobile']as const){const id=randomUUID();ids.push(id);const body=format==='engine'?{commandId:id,locationId:store,payload}:{operationId:id,storeId:store,...payload};const r=await handler(request(body),format);const data=await r.json();assert.equal(r.status,503,name+': '+JSON.stringify(data.error));assert.equal(data.error.code,'inventory_read_only');assert.match(r.headers.get('cache-control')||'',/no-store/)}
 const previewId=randomUUID();ids.push(previewId);const preview=await handleRestock(request({commandId:previewId,locationId:store,payload:{commit:false,lines:[{itemId:item,countedFrontStock:3,expectedRevision:0}]}}),'engine');assert.equal(preview.status,200,JSON.stringify(await preview.clone().json()));
 assert.equal((await ref.get()).updateTime?.toMillis(),before.updateTime?.toMillis())
 for(const id of ids){assert.equal((await db.collection('orgs').doc(org).collection('stockOperations').doc(id).get()).exists,false);assert.equal((await db.collection('engineOutbox').doc(Buffer.from(JSON.stringify([org,`${id}:inventory.stock-committed.v1`])).toString('base64url')).get()).exists,false)}
 console.log('Emergency pause passed all 14 HTTP adapters; preview remained read-only and available; no inventory, ledger or outbox changes occurred.')
}finally{await ref.delete();await db.terminate()}
