#!/usr/bin/env python3
import json,re,statistics
from pathlib import Path
P=Path('data/imports/tfm-266-specialty-cheese-2026-04-24/final-products.json')
D=json.loads(P.read_text())

def klass(name):
 x=name.lower()
 rules=[('hummus','hummus'),('pickle','pickle'),('cracker','cracker'),('crisp','cracker'),('prosciutto','prosciutto'),('pepperoni','pepperoni'),('salami','salami'),('sopress','salami'),('mortadella','salami'),('turkey','deli poultry'),('roast beef','deli beef'),('ham','deli ham'),('brat','sausage'),('kielbasa','sausage'),('sausage','sausage'),('frank','sausage'),('pate','pate'),('mousse','pate'),('feta','feta'),('burrata','mozzarella'),('mozzarella','mozzarella'),('parmesan','parmesan'),('reggiano','parmesan'),('gouda','gouda'),('cheddar','cheddar'),('colby','colby jack'),('jack','colby jack'),('swiss','swiss'),('emmental','swiss'),('gruyere','swiss'),('blue','blue cheese'),('gorgonzola','blue cheese'),('stilton','blue cheese'),('goat','goat cheese'),('chevre','goat cheese'),('brie','soft ripened cheese'),('camembert','soft ripened cheese'),('cream','soft ripened cheese'),('provolone','provolone'),('manchego','firm cheese'),('asiago','firm cheese'),('fontina','semi-soft cheese'),('havarti','semi-soft cheese'),('muenster','semi-soft cheese'),('dip','spread'),('spread','spread'),('tray','prepared tray')]
 for a,b in rules:
  if a in x:return b
 return 'cheese'

def weight(n,k):
 v=n.get('servingWeightGrams')
 if isinstance(v,(int,float)) and v>0:return float(v)
 s=(n.get('servingSize') or '').lower()
 m=re.search(r'(\d+(?:\.\d+)?)\s*g\b',s)
 if m:return float(m.group(1))
 m=re.search(r'(\d+(?:\.\d+)?)\s*oz\b',s)
 if m:return float(m.group(1))*28.349523125
 return 56.0 if k.startswith('deli ') or k in ('sausage','prepared tray') else 28.0

fields=['caloriesKcal','fatG','saturatedFatG','carbohydratesG','fiberG','sugarsG','proteinG','sodiumMg']
pools={}; broad={'cheese':[],'meat':[],'other':[]}
for p in D:
 c=p['common'];n=c.get('nutrition') or {};k=klass(c['name'])
 if n.get('dataKind') not in ('exact_product','matched_product','nutrition_label_ocr') or n.get('caloriesKcal') is None:continue
 w=weight(n,k); row={'gtin':p['gtin'],'values':{f:(float(n[f])*100/w if isinstance(n.get(f),(int,float)) else None) for f in fields}}
 pools.setdefault(k,[]).append(row)
 group='meat' if k in ('prosciutto','pepperoni','salami','deli poultry','deli beef','deli ham','sausage','pate') else ('other' if k in ('hummus','pickle','cracker','spread','prepared tray') else 'cheese')
 broad[group].append(row)

def median_profile(rows):
 out={}
 for f in fields:
  vals=[r['values'][f] for r in rows if r['values'][f] is not None and 0<=r['values'][f]<10000]
  if vals:out[f]=round(statistics.median(vals),2)
 return out
filled=parsed=0
for p in D:
 c=p['common'];n=c.get('nutrition') or {};k=klass(c['name'])
 if n and not n.get('servingWeightGrams'):
  n['servingWeightGrams']=round(weight(n,k),2);c['nutrition']=n;parsed+=1
 if n.get('caloriesKcal') is not None:continue
 group='meat' if k in ('prosciutto','pepperoni','salami','deli poultry','deli beef','deli ham','sausage','pate') else ('other' if k in ('hummus','pickle','cracker','spread','prepared tray') else 'cheese')
 rows=pools.get(k) or broad[group]
 if not rows:continue
 per100=median_profile(rows); grams=56 if group=='meat' or k=='prepared tray' else (30 if k in ('hummus','spread') else 28)
 values={f:round(v*grams/100,2) for f,v in per100.items()}
 values.update({'servingSize':('2 oz (56 g)' if grams==56 else ('2 Tbsp (30 g)' if grams==30 else '1 oz (28 g)')),'servingWeightGrams':grams,'dataKind':'representative_product_type','sourceSummary':f'Representative {k} profile calculated from reverified products in this catalog and normalized by serving weight. Replace with the physical supplier label when available.','verifiedAt':'2026-10-03','representativeFood':k,'evidenceProductGtins':[r['gtin'] for r in rows[:5]]})
 c['nutrition']=values;c['hasNutritionInfo']=True;filled+=1
P.write_text(json.dumps(D,indent=2)+'\n')
print(json.dumps({'parsedServingWeights':parsed,'categoryProfilesApplied':filled,'remainingWithoutCalories':sum((p['common'].get('nutrition') or {}).get('caloriesKcal') is None for p in D)},indent=2))
