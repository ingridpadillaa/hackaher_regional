"""Normalize an official QQP CSV/ZIP into a bounded Firestore-ready catalog. No DB writes."""
import argparse,csv,io,json,hashlib,re,unicodedata,zipfile,math
from pathlib import Path
from datetime import date

def norm(value): return ' '.join(''.join(c for c in unicodedata.normalize('NFD',str(value)) if not unicodedata.combining(c)).lower().split())
def key(value): return re.sub(r'[^a-z0-9]','',norm(value))
def ident(*values): return hashlib.sha256('|'.join(norm(v) for v in values).encode()).hexdigest()[:32]
def parse_day(value):
 parts=re.split(r'[-/T ]',value.strip())[:3]
 if len(parts)!=3: raise ValueError('date')
 a,b,c=map(int,parts)
 if len(parts[0])!=4:a,b,c=c,b,a
 return date(a,b,c).isoformat()
def convert(source,state,municipality,source_url,period=None):
 products,stores,prices={},{},{}
 rejected=0
 required={'producto','presentacion','marca','precio','fecharegistro','cadenacomercial','nombrecomercial','direccion','estado','municipio'}
 def rows(stream):
  nonlocal rejected
  reader=csv.DictReader(stream)
  names={name:key(name) for name in reader.fieldnames or []}
  if not required.issubset(names.values()):raise ValueError('Faltan columnas oficiales: '+','.join(sorted(required-set(names.values()))))
  for raw in reader:
   r={names[k]:v.strip() for k,v in raw.items() if k in names and v is not None}
   if norm(r['estado'])!=norm(state) or (municipality and norm(r['municipio']) not in {norm(x) for x in municipality}):continue
   if 'supermercado' not in norm(r.get('giro','')) and 'autoservicio' not in norm(r.get('giro','')):continue
   try:
    amount=float(r['precio'].replace(',',''));day=parse_day(r['fecharegistro'])
    if not math.isfinite(amount) or amount<=0 or day>date.today().isoformat() or not r['producto'] or not r['direccion']:raise ValueError('invalid')
   except (ValueError,KeyError):rejected+=1;continue
   pid=ident(r['producto'],r['marca'],r['presentacion'])
   sid=ident(r['cadenacomercial'],r['nombrecomercial'],r['direccion'],r['municipio'],r['estado'])
   name=' · '.join(x for x in [r['producto'],r['marca'],r['presentacion']] if x)
   products[pid]={'id':pid,'name':name,'searchName':norm(name),'searchTokens':list(dict.fromkeys(norm(name).split()))[:40],'unit':r['presentacion'],'brand':r['marca'],'source':'PROFECO QQP'}
   store={'id':sid,'name':r['nombrecomercial'],'chain':r['cadenacomercial'],'address':r['direccion'],'municipality':r['municipio'],'municipalityKey':norm(r['municipio']),'state':r['estado'],'stateKey':norm(r['estado']),'source':'PROFECO QQP'}
   try:
    lat=float(r['latitud']);lng=float(r['longitud'])
    if -90<=lat<=90 and -180<=lng<=180 and lat and lng:store.update(latitude=lat,longitude=lng)
   except (ValueError,KeyError):pass
   stores[sid]=store
   oid=pid+'_'+sid
   if oid not in prices or prices[oid]['date']<day:prices[oid]={'id':oid,'productId':pid,'storeId':sid,'price':round(amount,2),'date':day,'source':'PROFECO QQP','sourceUrl':source_url}
 if zipfile.is_zipfile(source):
  with zipfile.ZipFile(source) as archive:
   entries=[m for m in archive.infolist() if m.filename.lower().endswith('.csv') and (not period or period in m.filename)]
   if not entries:raise ValueError('No hay CSV para el periodo seleccionado')
   for member in entries:
    print('Leyendo',member.filename,flush=True)
    with archive.open(member) as f:rows(io.TextIOWrapper(f,encoding='utf-8-sig'))
 else:
  with open(source,encoding='utf-8-sig',newline='') as f:rows(f)
 if not prices:raise ValueError('Sin precios válidos para la zona seleccionada')
 digest=hashlib.sha256()
 with open(source,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
 return {'metadata':{'sourceUrl':source_url,'sha256':digest.hexdigest(),'state':state,'municipalities':municipality,'period':period,'rejected':rejected,'latestDate':max(p['date'] for p in prices.values())},'products':list(products.values()),'stores':list(stores.values()),'prices':list(prices.values())}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--file',required=True);p.add_argument('--state',required=True);p.add_argument('--municipality',action='append');p.add_argument('--period');p.add_argument('--source-url',required=True);p.add_argument('--output',required=True)
 a=p.parse_args();result=convert(a.file,a.state,a.municipality,a.source_url,a.period);Path(a.output).write_text(json.dumps(result,ensure_ascii=False));print({k:len(result[k]) for k in ['products','stores','prices']},result['metadata'])
