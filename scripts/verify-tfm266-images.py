#!/usr/bin/env python3
import concurrent.futures,json,urllib.request
from pathlib import Path
ROOT=Path('data/imports/tfm-266-specialty-cheese-2026-04-24');P=ROOT/'final-products.json';A=ROOT/'image-url-audit.json';D=json.loads(P.read_text())
BAD=('missing-item','not_available','image_not_available','placeholder','no-image','no_image')
def check(row):
 gtin,name,url=row;out={'gtin':gtin,'name':name,'url':url,'valid':False}
 if any(x in url.lower() for x in BAD):out['reason']='known placeholder';return out
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Range':'bytes=0-2047'})
  with urllib.request.urlopen(req,timeout=12) as r:
   c=(r.headers.get('content-type') or '').lower();final=r.url;r.read(2048)
  out.update(contentType=c,finalUrl=final,valid=c.startswith('image/'),reason='' if c.startswith('image/') else 'not an image response')
 except Exception as e:out['reason']=f'{type(e).__name__}: {str(e)[:120]}'
 return out
rows=[]
for p in D:
 for u in p['common'].get('images') or []:rows.append((p['gtin'],p['common']['name'],u))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:audit=list(ex.map(check,rows))
by={(x['gtin'],x['url']):x for x in audit};removed=0
for p in D:
 before=p['common'].get('images') or []
 after=[u for u in before if by.get((p['gtin'],u),{}).get('valid')]
 if before and not after:removed+=1
 p['common']['images']=after
P.write_text(json.dumps(D,indent=2)+'\n');A.write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'checked':len(audit),'valid':sum(x['valid'] for x in audit),'invalid':sum(not x['valid'] for x in audit),'productsLosingAllImages':removed},indent=2))
