import csv,json,pathlib,re,hashlib,shutil,urllib.request,concurrent.futures
D=pathlib.Path(__file__).resolve().parent
REPO=D.parent
OUT=D
SRC=D/'sources'; rows=lambda n:list(csv.DictReader((SRC/n).open(encoding='utf-8')))
species={x['id']:x for x in rows('pokemon_species.csv')}
pokemon={x['id']:x for x in rows('pokemon.csv')}
forms=rows('pokemon_forms.csv')
names={(x['pokemon_species_id'],x['local_language_id']):x['name'] for x in rows('pokemon_species_names.csv')}
form_names={(x['pokemon_form_id'],x['local_language_id']):x for x in rows('pokemon_form_names.csv')}
available={kind:{p.stem for p in (REPO/'sprites'/kind).glob('*.gif')} for kind in ['ani','ani-shiny']}
sprite_tree=json.loads((SRC/'sprite-tree.json').read_text(encoding='utf-8')); tree={x['path']:x for x in sprite_tree['tree']}
# Cross-library spelling and same-appearance variants. Explicit entries take
# priority over any default-species filename; e.g. Maushold and Minior differ.
special={
 'xerneas-active':'xerneas','arceus-normal':'arceus','pichu-spiky-eared':'pichu-spikyeared',
 'raticate-totem-alola':'raticate-alola-totem','greninja-battle-bond':'greninja',
 'zygarde-10-power-construct':'zygarde-10','zygarde-50-power-construct':'zygarde',
 'minior-red':'minior','minior-red-meteor':'minior-meteor',
 'mimikyu-totem-disguised':'mimikyu-totem','mimikyu-totem-busted':'mimikyu-busted-totem',
 'rockruff-own-tempo':'rockruff','necrozma-dusk':'necrozma-duskmane','necrozma-dawn':'necrozma-dawnwings',
 'darmanitan-galar-standard':'darmanitan-galar','toxtricity-amped-gmax':'toxtricity-gmax',
 'toxtricity-low-key-gmax':'toxtricity-gmax','urshifu-single-strike-gmax':'urshifu-gmax',
 'urshifu-rapid-strike-gmax':'urshifu-rapidstrike-gmax','maushold-family-of-four':'maushold-four',
 'maushold-family-of-three':'maushold','squawkabilly-green-plumage':'squawkabilly',
 'minior-orange-meteor':'minior-meteor','minior-yellow-meteor':'minior-meteor','minior-green-meteor':'minior-meteor',
 'minior-blue-meteor':'minior-meteor','minior-indigo-meteor':'minior-meteor','minior-violet-meteor':'minior-meteor',
}
default_forms={}
for f in forms:
 p=pokemon[f['pokemon_id']]
 if p['is_default']=='1' and f['is_default']=='1': default_forms[p['species_id']]=f['id']
assert len(default_forms)==len(species)==1025
downloads={};records=[];missing=[];decisions=[]
def gif_candidates(f,s,p):
 slug=f['identifier'];base=s['identifier'].replace('-','');tail=slug[len(s['identifier']):].lstrip('-')
 if slug in special: return [special[slug]]
 if s['identifier'] in ['scatterbug','spewpa','mothim']: return [base]
 if slug.startswith('alcremie-') and '-sweet' in slug:
  cream,sweet=tail.rsplit('-',2)[0],tail.rsplit('-',2)[1]
  stem='alcremie' if cream=='vanilla-cream' else 'alcremie-'+cream.replace('-','')
  return [stem if sweet=='strawberry' else stem+'-'+sweet, 'alcremie-'+cream+'-'+sweet]
 tail=re.sub(r'-(?:cap|breed|plumage)$','',tail)
 if tail=='female':tail='f'
 candidates=[slug,base+('-'+tail if tail else ''),base+('-'+tail.replace('-','') if tail else '')]
 if default_forms[s['id']]==f['id']: candidates += [base,s['identifier']]
 return list(dict.fromkeys(candidates))
def static_path(f,kind):
 p=pokemon[f['pokemon_id']];s=species[p['species_id']]
 form=f['form_identifier'];n=p['id']
 candidates=[]
 if form: candidates += [n+'-'+form+'.png',s['id']+'-'+form+'.png']
 # Numeric API Pokémon IDs name their default forms only. Never use this
 # fallback for a distinct cosmetic form sharing the same Pokémon record.
 if f['is_default']=='1': candidates += [n+'.png']
 for prefix in ['sprites/pokemon/other/home/','sprites/pokemon/']:
  if kind=='ani-shiny':prefix+='shiny/'
  for name in candidates:
   src=prefix+name
   if src in tree:
    dest='registry/media/'+('shiny/' if kind=='ani-shiny' else 'normal/')+f['identifier']+'.png'
    downloads[dest]={'path':dest,'sourcePath':src,'gitBlob':tree[src]['sha'],'url':'https://raw.githubusercontent.com/PokeAPI/sprites/'+sprite_tree['commit']+'/'+src}
    return dest
 return None
for f in forms:
 p=pokemon[f['pokemon_id']];s=species[p['species_id']]
 ja=names[(s['id'],'1')];fn=form_names.get((f['id'],'1'),{})
 is_default=default_forms[s['id']]==f['id'];form_ja=fn.get('form_name') or ''
 display_ja=fn.get('pokemon_name') or (form_ja if ja in form_ja else ja+'（'+form_ja+'）') if form_ja and not is_default else ja
 record={'id':f['identifier'],'speciesId':int(s['id']),'formId':int(f['id']),'species':s['identifier'],'ja':ja,'displayJa':display_ja,'formJa':form_ja, 'formKey':f['form_identifier'],'default':is_default,'sprites':{}}
 candidates=gif_candidates(f,s,p)
 for kind,key in [('ani','normal'),('ani-shiny','shiny')]:
  match=next((x for x in candidates if x in available[kind]),None)
  record['sprites'][key]='sprites/'+kind+'/'+match+'.gif' if match else static_path(f,kind)
  if record['sprites'][key] is None:missing.append({'id':record['id'],'kind':key})
 # Preserve existing female sprites without pretending they are API forms.
 if record['default']:
  base=s['identifier'].replace('-','')+'-f'
  for kind,key in [('ani','female'),('ani-shiny','femaleShiny')]:
   if base in available[kind]:record['sprites'][key]='sprites/'+kind+'/'+base+'.gif'
 records.append(record)
 decisions.append({'id':f['identifier'],'candidates':candidates,'sprites':record['sprites']})
def download(row):
 dest=REPO/row['path'];dest.parent.mkdir(parents=True,exist_ok=True)
 raw=dest.read_bytes() if dest.exists() else urllib.request.urlopen(row['url'],timeout=60).read()
 assert raw[:8]==b'\x89PNG\r\n\x1a\n'
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==row['gitBlob']
 dest.write_bytes(raw);return dict(row,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: downloads=list(pool.map(download,downloads.values()))
provenance=json.loads((SRC/'provenance.json').read_text(encoding='utf-8'))
catalog={'version':1,'sourceCommit':provenance['commit'],'speciesCount':len(species),'records':records,'inputAliases':{'ピディブ':'pidove'}}
(OUT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'catalog.js').write_text('// Generated from catalog.json. See README.md and source provenance.\nexport default '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
for f in provenance['files']:
 dest=OUT/'sources'/f['path'];dest.parent.mkdir(exist_ok=True);
 if (SRC/f['path']).resolve()!=dest.resolve():shutil.copyfile(SRC/f['path'],dest)
# Source provenance already resides alongside these CSV snapshots.
(OUT/'media-manifest.json').write_text(json.dumps(downloads,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'species':len(species),'forms':len(records),'downloads':len(downloads),'downloadBytes':sum(x['bytes'] for x in downloads),'missing':missing,'defaultMissing':[x for x in missing if next(r for r in records if r['id']==x['id'])['default']]}
(D/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(D/'mapping-decisions.json').write_text(json.dumps(decisions,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
