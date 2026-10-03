#!/usr/bin/env python3
import concurrent.futures, html, json, re, ssl, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path('data/imports/tfm-266-specialty-cheese-2026-04-24')
PRODUCTS = ROOT / 'final-products.json'
AUDIT = ROOT / 'source-page-audit.json'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15 InvenTrackerProductAudit/1.0'
STOP = {'the','and','with','from','fresh','market','large','small','sliced','slice','bags','bag','ew','ft','section','left'}

def tokens(s):
    return {x for x in re.findall(r'[a-z0-9]+', (s or '').lower()) if len(x)>2 and x not in STOP}

def score(a,b):
    aa,bb=tokens(a),tokens(b)
    return len(aa&bb)/max(1,min(len(aa),len(bb)))

def source_url(p):
    c=p['common']; n=c.get('nutrition') or {}
    return (c.get('webResearch') or {}).get('sourceUrl') or n.get('sourceUrl') or ''

def flatten(obj):
    if isinstance(obj,list):
        for x in obj: yield from flatten(x)
    elif isinstance(obj,dict):
        yield obj
        for k in ('@graph','mainEntity','itemListElement'):
            if k in obj: yield from flatten(obj[k])

def clean_text(v):
    if isinstance(v,list): return ', '.join(clean_text(x) for x in v if x)
    if isinstance(v,dict): return clean_text(v.get('name') or v.get('value') or '')
    return html.unescape(re.sub(r'<[^>]+>',' ',str(v or ''))).strip()

def numeric(v):
    if v is None:return None
    m=re.search(r'-?\d+(?:\.\d+)?',clean_text(v).replace(',',''))
    return float(m.group()) if m else None

def mg(v):
    n=numeric(v)
    if n is None:return None
    text=clean_text(v).lower()
    return n*1000 if re.search(r'\b(g|gram|grams)\b',text) and 'mg' not in text else n

def absolute(url,base):
    if isinstance(url,list): url=next((x for x in url if isinstance(x,str)), '')
    if isinstance(url,dict): url=url.get('url') or url.get('contentUrl') or ''
    u=urllib.parse.urljoin(base,str(url or ''))
    return u if u.startswith('https://') else ''

def fetch(entry):
    gtin,name,url=entry
    result={'gtin':gtin,'name':name,'url':url,'status':'failed','checkedAt':'2026-10-03T05:30:00Z'}
    if not url:return result
    try:
        req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'})
        with urllib.request.urlopen(req,timeout=14,context=ssl.create_default_context()) as r:
            ctype=r.headers.get('content-type','')
            raw=r.read(4_000_000)
            final=r.url
        if 'html' not in ctype and not raw.lstrip().startswith(b'<'):
            result.update(status='non_html',finalUrl=final);return result
        text=raw.decode('utf-8','ignore')
        plain=html.unescape(re.sub(r'<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>',' ',text,flags=re.I|re.S))
        plain=re.sub(r'\s+',' ',plain)
        title=''
        tm=re.search(r'<title[^>]*>(.*?)</title>',text,re.I|re.S)
        if tm:title=clean_text(tm.group(1))
        gtin_hit=gtin in re.sub(r'\D','',text) or gtin.lstrip('0') in re.sub(r'\D','',text)
        name_score=max(score(name,title),score(name,plain[:10000]))
        candidates=[]
        for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',text,re.I|re.S):
            try:candidates.extend(flatten(json.loads(html.unescape(m.group(1)).strip())))
            except Exception:pass
        products=[]
        for o in candidates:
            typ=o.get('@type','')
            if isinstance(typ,list):is_product=any(str(x).lower()=='product' for x in typ)
            else:is_product=str(typ).lower()=='product'
            if is_product or 'nutrition' in o or 'nutritionInformation' in o: products.append(o)
        best=max(products,key=lambda o:score(name,clean_text(o.get('name'))),default={})
        nutrition=best.get('nutrition') or best.get('nutritionInformation') or {}
        if not isinstance(nutrition,dict):nutrition={}
        image=absolute(best.get('image'),final)
        if not image:
            mm=re.search(r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)',text,re.I)
            if not mm: mm=re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image["\']',text,re.I)
            if mm:image=absolute(html.unescape(mm.group(1)),final)
        label_images=[]
        for tag in re.findall(r'<img\b[^>]*>',text,re.I):
            if re.search(r'nutrition|nutritional|facts panel',tag,re.I):
                sm=re.search(r'(?:src|data-src)=["\']([^"\']+)',tag,re.I)
                if sm:
                    u=absolute(html.unescape(sm.group(1)),final)
                    if u and u not in label_images:label_images.append(u)
        def pick(*keys):
            for k in keys:
                if k in nutrition:return nutrition[k]
                if k in best:return best[k]
        out={
          'servingSize':clean_text(pick('servingSize','serving_size')),
          'caloriesKcal':numeric(pick('calories','calorieContent','energyContent')),
          'fatG':numeric(pick('fatContent','totalFat')),
          'saturatedFatG':numeric(pick('saturatedFatContent','saturatedFat')),
          'carbohydratesG':numeric(pick('carbohydrateContent','totalCarbohydrate')),
          'fiberG':numeric(pick('fiberContent','dietaryFiber')),
          'sugarsG':numeric(pick('sugarContent','sugars')),
          'proteinG':numeric(pick('proteinContent','protein')),
          'sodiumMg':mg(pick('sodiumContent','sodium')),
          'ingredientsText':clean_text(best.get('ingredients') or best.get('ingredient')),
        }
        out={k:v for k,v in out.items() if v not in (None,'')}
        result.update(status='ok',finalUrl=final,pageTitle=title,gtinPresent=gtin_hit,nameMatchScore=round(name_score,3),productName=clean_text(best.get('name')),imageUrl=image,nutritionLabelImages=label_images[:4],structuredNutrition=out)
    except Exception as e:
        result['error']=f'{type(e).__name__}: {str(e)[:180]}'
    return result

def main():
    products=json.loads(PRODUCTS.read_text())
    entries=[(p['gtin'],p['common']['name'],source_url(p)) for p in products]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        rows=list(pool.map(fetch,entries))
    AUDIT.write_text(json.dumps(rows,indent=2)+'\n')
    accepted=images=nutrition=labels=0
    by_gtin={r['gtin']:r for r in rows}
    for p in products:
        c=p['common']; r=by_gtin[p['gtin']]
        trusted=r.get('status')=='ok' and (r.get('gtinPresent') or r.get('nameMatchScore',0)>=0.6 or (c.get('webResearch') or {}).get('exactGtinMatch'))
        if not trusted:continue
        accepted+=1
        if r.get('imageUrl') and not c.get('images'):
            c['images']=[r['imageUrl']]; images+=1
        n=c.get('nutrition') or {}
        structured=r.get('structuredNutrition') or {}
        added=False
        for k,v in structured.items():
            if n.get(k) in (None,''):
                n[k]=v;added=True
        if n:
            n.setdefault('sourceUrl',r.get('finalUrl') or r.get('url'))
            n.setdefault('sourceSummary','Reverified from the linked product page; values are stored per declared serving.')
            if r.get('nutritionLabelImages'): n['nutritionLabelImageUrls']=r['nutritionLabelImages']
            c['nutrition']=n;c['hasNutritionInfo']=True
        if added:nutrition+=1
        if r.get('nutritionLabelImages'):labels+=1
        c['sourcePageReverifiedAt']='2026-10-03T05:30:00Z'
    PRODUCTS.write_text(json.dumps(products,indent=2)+'\n')
    print(json.dumps({'pagesChecked':len(rows),'acceptedMatches':accepted,'newImages':images,'nutritionRecordsExpanded':nutrition,'pagesWithNutritionLabelImages':labels,'successfulFetches':sum(r['status']=='ok' for r in rows)},indent=2))
if __name__=='__main__':main()
