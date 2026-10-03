#!/usr/bin/env python3
import json,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path('data/imports/tfm-266-specialty-cheese-2026-04-24');P=ROOT/'final-products.json';A=ROOT/'upcitemdb-image-audit.json'
D=json.loads(P.read_text());rows=[];added=0;remaining=None
missing=[p for p in D if not p['common'].get('images')][:95]
for i,p in enumerate(missing,1):
 u='https://api.upcitemdb.com/prod/trial/lookup?'+urllib.parse.urlencode({'upc':p['gtin']})
 row={'gtin':p['gtin'],'requestedName':p['common']['name'],'checkedAt':'2026-10-03'}
 try:
  req=urllib.request.Request(u,headers={'User-Agent':'InvenTracker/1.0','Accept':'application/json'})
  with urllib.request.urlopen(req,timeout=15) as r:
   remaining=r.headers.get('X-RateLimit-Remaining');d=json.load(r)
  item=(d.get('items') or [None])[0]
  if item:
   images=[x for x in item.get('images',[]) if isinstance(x,str) and x.startswith('https://')]
   row.update(status='matched',title=item.get('title'),brand=item.get('brand'),images=images,remaining=remaining)
   if images:
    p['common']['images']=[images[0]];p['common'].setdefault('sourceEvidence',[]).append({'source':'UPCitemdb exact GTIN lookup','url':u,'title':item.get('title'),'exactBarcodeMatch':True,'verifiedAt':'2026-10-03'});added+=1
  else:row.update(status='not_found',remaining=remaining)
 except Exception as e:
  row.update(status='failed',error=f'{type(e).__name__}: {str(e)[:160]}',remaining=remaining)
 rows.append(row);time.sleep(.18)
P.write_text(json.dumps(D,indent=2)+'\n');A.write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'lookups':len(rows),'photosAdded':added,'rateLimitRemaining':remaining},indent=2))
