import assert from 'node:assert/strict';
const origin=process.env.INVENTRAKER_TEST_ORIGIN||'http://localhost:3010';
const org='east-liberty-market-group';
const key=process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k';
async function login(email,password){const data=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})}).then(r=>r.json());assert.ok(data.idToken,'Test user sign-in failed');return data.idToken;}
const owner=await login(process.env.INVENTRAKER_TEST_OWNER_EMAIL||'market.owner@inventraker.app',process.env.INVENTRAKER_TEST_OWNER_PASSWORD||'MarketOwner2026!');
const employee=await login(process.env.INVENTRAKER_TEST_EMPLOYEE_EMAIL||'market.employee@inventraker.app',process.env.INVENTRAKER_TEST_EMPLOYEE_PASSWORD||'MarketEmployee2026!');
async function call(path,{token,body,orgId=org}={}){const response=await fetch(`${origin}${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-inventracker-org':orgId,...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
assert.equal((await call('/api/billing/quote?tier=builder')).status,401);
assert.equal((await call('/api/billing/quote?tier=builder',{token:employee})).status,403);
assert.equal((await call('/api/billing/quote?tier=builder',{token:owner,orgId:'unassigned-billing-org'})).status,404);
for(const [tier,base]of [['builder',4999],['basic',9999],['pro',19999]]){const quote=await call(`/api/billing/quote?tier=${tier}`,{token:owner});assert.equal(quote.status,200,JSON.stringify(quote.body));assert.equal(quote.body.quote.baseCents,base);assert.equal(quote.body.sandbox,true);assert.ok(quote.body.quote.totalCents>=base);assert.ok(!JSON.stringify(quote.body).includes('price_'));}
assert.equal((await call('/api/stripe/checkout',{body:{ownerEmail:'someone@example.invalid'}})).status,401);
assert.equal((await call('/api/stripe/signup-checkout',{body:{}})).status,401);
assert.equal((await call('/api/stripe/checkout',{token:employee,body:{}})).status,403);
assert.equal((await call('/api/stripe/checkout',{token:owner,body:{plan:'pro',price:1,seats:1}})).status,400);
assert.equal((await call('/api/stripe/portal',{token:employee,body:{ownerEmail:'market.owner@inventraker.app'}})).status,403);
const noMapping=await call('/api/stripe/portal',{token:owner,body:{ownerEmail:'arbitrary@example.invalid'}});assert.equal(noMapping.status,409);
assert.equal((await call('/api/signup/finalize',{body:{}})).status,410);
const hijack=await call('/api/signup/trial',{body:{password:'NeverAppliedPassword2026!',signup:{ownerFirstName:'Internal',ownerLastName:'Check',ownerEmail:'market.owner@inventraker.app',organizationName:'INTERNAL BILLING AUTH CHECK',stores:[{location:'Test',nickname:'Test'}],employeeCount:0,employees:[],businessDescription:'Internal regression test'}}});assert.equal(hijack.status,409);
await login(process.env.INVENTRAKER_TEST_OWNER_EMAIL||'market.owner@inventraker.app',process.env.INVENTRAKER_TEST_OWNER_PASSWORD||'MarketOwner2026!');
for(const collection of ['billingAccounts','billingCustomers','billingCheckoutRequests','billingWebhookEvents']){const response=await fetch(`https://firestore.googleapis.com/v1/projects/inventracker-f1229/databases/(default)/documents/${collection}/probe`,{headers:{authorization:`Bearer ${owner}`}});assert.equal(response.status,403,'Client tokens must not read private billing records');}
console.log('Billing HTTP checks passed: authenticated quotes, owner/employee isolation, all tier prices, no browser-price trust, no email-based portal access, private records and existing-account password protection. No checkout or charge created.');
