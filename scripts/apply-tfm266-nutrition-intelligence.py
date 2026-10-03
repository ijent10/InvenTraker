#!/usr/bin/env python3
import json,re,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path('data/imports/tfm-266-specialty-cheese-2026-04-24')
PATH=ROOT/'final-products.json'; AUDIT=ROOT/'usda-representative-audit.json'; OCR=Path('/tmp/tfm266-labels/ocr.json')

def n(serving,grams,cal,fat,sat,carb,fiber,sugar,protein,sodium,ingredients=''):
 return {'servingSize':serving,'servingWeightGrams':grams,'caloriesKcal':cal,'fatG':fat,'saturatedFatG':sat,'carbohydratesG':carb,'fiberG':fiber,'sugarsG':sugar,'proteinG':protein,'sodiumMg':sodium,'ingredientsText':ingredients}
OCR_VALUES={
'00039496001123':n('1 oz (28 g)',28,80,6,4,1,0,0,4,180),
'00643831002517':n('1 oz (28 g)',28,110,9,5,1,0,0,6,180,'Pasteurized milk, cheese cultures, salt, natural and artificial flavor, enzymes, horseradish powder.'),
'00643831002876':n('1 oz (28 g)',28,110,8,5,0,0,0,7,170,'Cultured pasteurized milk, banana peppers, salt, enzymes.'),
'00737094225872':n('2 Tbsp (28 g)',28,50,3.5,0,4,1,None,1,110),
'00854086007725':n('2 oz (56 g)',56,180,8,4,19,1,16,9,420),
'00854086007749':n('2 oz (56 g)',56,180,8,4,19,1,16,9,420),
'00856475007262':n('1 oz (28 g)',28,89,7,5.1,1,0,0,6.7,314,"Goat cheese (goat's milk, egg lysozyme), water, sodium polyphosphate, monosodium phosphate, corn starch, salt, natural smoke."),
'00856617004692':n('7 crisps (25 g)',25,130,9,6,4,0,0,9,270),
'00856800006571':n('1 oz (28 g)',28,100,7,2.5,1,0,0,8,490),
'02813702009442':n('1 oz (28 g)',28,110,9,6,0,0,0,7,200),
'10034463016145':n('1 oz (28 g)',28,120,10,6,0,0,0,7,200),
}

def food_class(name):
 x=name.lower()
 rules=[
 ('hummus','hummus prepared'),('pickle','pickles cucumber dill'),('cracker','crackers cheese'),('crisp','cheese crisps'),
 ('prosciutto','prosciutto'),('pepperoni','pepperoni sliced'),('salami','salami cooked beef and pork'),('sopress','salami dry'),('mortadella','mortadella'),
 ('turkey','turkey breast deli meat'),('roast beef','roast beef deli meat'),('ham','ham sliced deli meat'),('brat','bratwurst cooked'),('kielbasa','kielbasa cooked'),('sausage','sausage smoked'),('frank','frankfurter beef'),('hot dog','frankfurter beef'),('pate','pate liver'),('mousse','pate liver'),
 ('feta','cheese feta'),('burrata','cheese mozzarella whole milk'),('mozzarella','cheese mozzarella whole milk'),('parmesan','cheese parmesan hard'),('reggiano','cheese parmesan hard'),
 ('gouda','cheese gouda'),('cheddar','cheese cheddar'),('colby','cheese colby'),('pepper jack','cheese monterey jack'),('monterey','cheese monterey jack'),
 ('swiss','cheese swiss'),('emmental','cheese swiss'),('gruyere','cheese gruyere'),('blue','cheese blue'),('gorgonzola','cheese blue'),('stilton','cheese blue'),
 ('goat','cheese goat soft'),('chevre','cheese goat soft'),('brie','cheese brie'),('camembert','cheese camembert'),('triple cream','cheese brie'),
 ('provolone','cheese provolone'),('manchego','cheese manchego'),('asiago','cheese asiago'),('fontina','cheese fontina'),('havarti','cheese havarti'),('muenster','cheese muenster'),
 ('cream cheese','cream cheese'),('pimento','cheese spread'),('dip','cheese dip'),('spread','cheese spread'),('snack tray','cheese and meat tray'),('charcuterie','cheese and meat tray')]
 for key,q in rules:
  if key in x:return q
 return 'cheese natural'

def serving_for(query):
 if query in ('hummus prepared','cheese dip','cheese spread'):return 30,'2 Tbsp (30 g)'
 if any(k in query for k in ('turkey','roast beef','ham sliced','bratwurst','kielbasa','sausage','frankfurter','cheese and meat')):return 56,'2 oz (56 g)'
 return 28,'1 oz (28 g)'

def fetch_usda(query):
 url='https://api.nal.usda.gov/fdc/v1/foods/search?'+urllib.parse.urlencode({'api_key':'DEMO_KEY','query':query,'pageSize':8,'dataType':'Foundation,SR Legacy'})
 with urllib.request.urlopen(url,timeout=20) as r:d=json.load(r)
 foods=d.get('foods') or []
 if not foods:return None
 q=set(re.findall(r'[a-z]+',query.lower()))
 def rank(f):
  desc=set(re.findall(r'[a-z]+',(f.get('description') or '').lower()))
  return (len(q&desc),f.get('dataType')=='Foundation')
 f=max(foods,key=rank); nutrients={x.get('nutrientName'):x.get('value') for x in f.get('foodNutrients',[]) if x.get('value') is not None}
 def pick(*names):
  for name in names:
   if name in nutrients:return float(nutrients[name])
 grams,label=serving_for(query);factor=grams/100
 def scaled(*names):
  v=pick(*names);return round(v*factor,2) if v is not None else None
 return {'fdcId':f.get('fdcId'),'description':f.get('description'),'dataType':f.get('dataType'),'servingWeightGrams':grams,'servingSize':label,'caloriesKcal':scaled('Energy','Energy (Atwater General Factors)','Energy (Atwater Specific Factors)'),'fatG':scaled('Total lipid (fat)'),'saturatedFatG':scaled('Fatty acids, total saturated'),'carbohydratesG':scaled('Carbohydrate, by difference'),'fiberG':scaled('Fiber, total dietary'),'sugarsG':scaled('Sugars, total including NLEA','Total Sugars'),'proteinG':scaled('Protein'),'sodiumMg':scaled('Sodium, Na')}

def main():
 data=json.loads(PATH.read_text()); ocr_rows={x['gtin']:x for x in json.loads(OCR.read_text())} if OCR.exists() else {}
 ocr_added=0
 for p in data:
  gtin=p['gtin'];c=p['common']; current=c.get('nutrition') or {}
  if gtin in OCR_VALUES and not current.get('caloriesKcal'):
   current.update({k:v for k,v in OCR_VALUES[gtin].items() if v is not None})
   row=ocr_rows.get(gtin,{})
   current.update({'dataKind':'nutrition_label_ocr','sourceUrl':row.get('url',''),'nutritionLabelImageUrls':[row['url']] if row.get('url') else [],'sourceSummary':'Values transcribed with Apple Vision OCR from the linked product nutrition label and manually checked against the recognized text. Confirm against the physical package when the formulation changes.','verifiedAt':'2026-10-03'})
   c['nutrition']=current;c['hasNutritionInfo']=True;ocr_added+=1
 missing=[p for p in data if not (p['common'].get('nutrition') or {}).get('caloriesKcal')]
 classes=sorted({food_class(p['common']['name']) for p in missing}); cache={};audit=[]
 for q in classes:
  try:cache[q]=fetch_usda(q)
  except Exception as e:cache[q]=None
  audit.append({'query':q,'result':cache[q]});time.sleep(.12)
 representative=0
 for p in missing:
  c=p['common'];q=food_class(c['name']);r=cache.get(q)
  if not r:continue
  values={k:v for k,v in r.items() if k not in ('fdcId','description','dataType') and v is not None}
  values.update({'dataKind':'representative_product_type','sourceUrl':f"https://fdc.nal.usda.gov/fdc-app.html#/food-details/{r['fdcId']}/nutrients",'sourceSummary':f"Representative {r['description']} values from USDA FoodData Central, scaled from 100 g to {r['servingSize']}. Replace with the supplier label when available.",'verifiedAt':'2026-10-03','usdaFdcId':r['fdcId'],'representativeFood':r['description']})
  c['nutrition']=values;c['hasNutritionInfo']=True;representative+=1
 PATH.write_text(json.dumps(data,indent=2)+'\n');AUDIT.write_text(json.dumps(audit,indent=2)+'\n')
 print(json.dumps({'ocrLabelsApplied':ocr_added,'representativeProfilesApplied':representative,'usdaClassesQueried':len(classes),'remainingWithoutCalories':sum(not (p['common'].get('nutrition') or {}).get('caloriesKcal') for p in data)},indent=2))
if __name__=='__main__':main()
