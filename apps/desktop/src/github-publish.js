const https=require('node:https');
const tls=require('node:tls');
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');
const archiver=require('archiver');
const core=require('./core');
const REPO='IamRex48/jugosafio-addons';
const API=`https://api.github.com/repos/${REPO}`;
const ca=[...tls.rootCertificates,...(tls.getCACertificates?.('system')||[])];
function request(token,method,url,body,contentType='application/json') {
  const target=new URL(url);
  if(!['api.github.com','uploads.github.com'].includes(target.hostname)||target.protocol!=='https:'||target.port||target.username||target.password)throw new Error('Destino de publicación no permitido.');
  const payload=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    const req=https.request(target,{method,ca,headers:{'User-Agent':'FonyxLauncher','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{'Authorization':`Bearer ${token}`}:{ }),...(payload?{'Content-Type':contentType,'Content-Length':payload.length}:{})}},res=>{
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){res.destroy(new Error('Respuesta de GitHub demasiado grande.'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{
        let result;try{result=JSON.parse(Buffer.concat(chunks).toString()||'null');}catch{return reject(new Error('GitHub devolvió una respuesta inválida.'));}
        if(res.statusCode<200||res.statusCode>=300){const error=new Error(res.statusCode===401?'La autorización de GitHub caducó o no es válida.':res.statusCode===403?'GitHub no permite esta acción. Revisa Contents: Read and write y los límites de uso.':res.statusCode===422?'Conflicto en GitHub: otro administrador pudo publicar primero. Recarga la publicación y reintenta.':`GitHub respondió ${res.statusCode}. No se completó la publicación.`);error.status=res.statusCode;return reject(error);}
        resolve(result);
      });
    });
    req.setTimeout(method==='GET'?15000:300000,()=>req.destroy(new Error('GitHub no respondió a tiempo. Revisa la conexión antes de reintentar.')));
    req.on('error',()=>reject(new Error('No se pudo completar la conexión segura con GitHub.')));
    if(payload)req.end(payload);else req.end();
  });
}
function client(token,transport=request){return (method,route,body,type)=>transport(token,method,route.startsWith('https:')?route:API+route,body,type);}
async function authorize(token,transport=request){
  if(typeof token!=='string'||!/^\S{20,255}$/.test(token))throw new Error('Pega un token válido de GitHub.');
  const api=client(token,transport),repo=await api('GET','');
  if(repo.private||!repo.permissions?.push)throw new Error('Necesitas acceso de escritura al repositorio público de Fonyx.');
  const user=await api('GET','https://api.github.com/user');
  return {login:user.login,repo:REPO};
}
async function zipFolder(folder,dest){
  await new Promise((resolve,reject)=>{
    const output=fs.createWriteStream(dest,{flags:'wx'}),zip=archiver('zip',{zlib:{level:6}});
    output.on('close',resolve);output.on('error',reject);zip.on('error',reject);zip.on('warning',reject);zip.pipe(output);
    // Stable metadata makes repeated imports of identical content share their SHA-256.
    zip.directory(folder,false,entry=>({...entry,date:new Date('2000-01-01T00:00:00Z'),mode:entry.stats?.isDirectory()?0o755:0o644}));zip.finalize().catch(reject);
  });
}
async function prepareAddon(file,stage){
  if(!/\.(mcaddon|mcpack|zip)$/i.test(file)||!(await fsp.stat(file)).isFile()||(await fsp.stat(file)).size>512*1024*1024)throw new Error('Elige un .mcaddon, .mcpack o .zip de hasta 512 MB.');
  const budget={bytes:0,entries:0};
  const unpacked=path.join(stage,'unpacked');await fsp.mkdir(unpacked);await core.extract(file,unpacked,budget);
  const folders=[],origins=new Map();let nested=0;
  async function scan(dir,depth=0,origin=path.basename(file),archiveDepth=0){
    if(depth>32||archiveDepth>5)throw new Error('El addon tiene demasiados archivos anidados: '+origin);
    if(fs.existsSync(path.join(dir,'manifest.json'))){folders.push(dir);origins.set(dir,origin);return;}
    for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
      const item=path.join(dir,entry.name);
      if(entry.name==='__MACOSX'||entry.name.startsWith('._'))continue;
      if(entry.isDirectory())await scan(item,depth+1,origin+' / '+entry.name,archiveDepth);
      else if(/\.(mcpack|mcaddon|zip)$/i.test(entry.name)){
        if(++nested>100)throw new Error('El addon contiene demasiados archivos anidados.');
        const target=path.join(stage,'nested-'+nested);await fsp.mkdir(target);await core.extract(item,target,budget);await scan(target,depth+1,origin+' / '+entry.name,archiveDepth+1);
      }
    }
  }
  await scan(unpacked);
  if(!folders.length||folders.length>100)throw new Error('No se encontraron entre 1 y 100 packs con manifest.json.');
  const packs=[],ids=new Map(),manifests=new Map();
  for(const folder of folders){
    let manifest;
    try{manifest=await core.readJson(path.join(folder,'manifest.json'));}catch(error){if(error instanceof SyntaxError)throw new Error('El manifest.json no contiene JSON válido: '+origins.get(folder));throw error;}
    if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('El manifest.json no describe un pack: '+origins.get(folder));
    manifests.set(folder,manifest);
    const uuid=typeof manifest.header?.uuid==='string'?manifest.header.uuid.toLowerCase():'';
    if(!uuid)continue;
    const name=String(manifest.header.name||'Pack sin nombre').replace(/§[0-9a-fk-or]/gi,'').slice(0,100);
    const label=`${name} · versión ${Array.isArray(manifest.header.version)?manifest.header.version.join('.'):'desconocida'}\n  ${origins.get(folder)}`;
    if(!ids.has(uuid))ids.set(uuid,[]);ids.get(uuid).push(label);
  }
  const duplicates=[...ids].filter(([,items])=>items.length>1);
  if(duplicates.length)throw new Error('Hay addons con el mismo UUID dentro del archivo:\n\n'+duplicates.map(([uuid,items])=>`UUID: ${uuid}\n`+items.map(item=>'• '+item).join('\n')).join('\n\n')+'\n\nConserva una sola copia de cada pack y vuelve a importar. Los nombres de archivo distintos no cambian su UUID. No se publicó ningún cambio.');
  for(const folder of folders){
    const m=manifests.get(folder),modules=Array.isArray(m?.modules)?m.modules:[];
    const resources=modules.some(x=>x?.type==='resources'),data=modules.some(x=>['data','script'].includes(x?.type));
    const kind=resources===data?null:resources?'resources':'data';
    const p={uuid:typeof m?.header?.uuid==='string'?m.header.uuid.toLowerCase():'',version:m?.header?.version,kind,sha256:'0'.repeat(64),url:'https://github.com/pack.mcpack'};
    try{core.validateFeed({schema:1,packs:[p]});}catch(error){throw new Error(error.message+'\nArchivo: '+origins.get(folder));}
    const archive=path.join(stage,p.uuid+'.mcpack');await zipFolder(folder,archive);
    const buffer=await fsp.readFile(archive);p.sha256=crypto.createHash('sha256').update(buffer).digest('hex');
    let name=typeof m.header.name==='string'?m.header.name:p.uuid;
    if(/^[a-z0-9_.:-]+$/i.test(name)&&name.includes('.')){
      for(const locale of ['es_MX','es_ES','en_US']){
        const file=path.join(folder,'texts',locale+'.lang');
        try{if((await fsp.stat(file)).size>2*1024*1024)continue;const line=(await fsp.readFile(file,'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>line.startsWith(name+'='));if(line&&line.slice(name.length+1).trim()){name=line.slice(name.length+1).trim();break;}}catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }
    packs.push({...p,file:archive,name:name.replace(/§[0-9a-fk-or]/gi,'').slice(0,100),bytes:buffer.length,source:origins.get(folder),dependencies:(Array.isArray(m.dependencies)?m.dependencies:[]).filter(d=>typeof d?.uuid==='string').map(d=>({uuid:d.uuid.toLowerCase(),version:d.version}))});
    if(packs.reduce((total,p)=>total+p.bytes,0)>512*1024*1024)throw new Error('Los packs preparados superan 512 MB. Sube el addon por partes.');
  }
  return packs;
}
async function prepareAddons(files,stage){
  if(!Array.isArray(files)||!files.length||files.length>100)throw new Error('Selecciona entre 1 y 100 archivos de addons.');
  let sourceBytes=0;
  for(const file of files){sourceBytes+=(await fsp.stat(file)).size;if(sourceBytes>512*1024*1024)throw new Error('Los archivos seleccionados superan 512 MB.');}
  const packs=[],ids=new Map();let bytes=0;
  for(const file of files){
    const batch=await fsp.mkdtemp(path.join(stage,'import-'));
    for(const pack of await prepareAddon(file,batch)){
      const previous=ids.get(pack.uuid);
      if(previous)throw new Error(`UUID repetido en la selección: ${pack.uuid}\n${previous.name} (${previous.version.join('.')}) — ${previous.source}\n${pack.name} (${pack.version.join('.')}) — ${pack.source}\nConserva una sola copia. No se modificó la selección anterior.`);
      ids.set(pack.uuid,pack);packs.push(pack);bytes+=pack.bytes;
      if(bytes>512*1024*1024)throw new Error('La selección de addons supera 512 MB.');
    }
  }
  return packs;
}
const {packPlan}=require('../../../packages/core');
async function assets(api,id){
  const all=[];for(let page=1;page<=100;page++){const batch=await api('GET',`/releases/${id}/assets?per_page=100&page=${page}`);all.push(...batch);if(batch.length<100)return all;}
  throw new Error('Demasiados archivos en esta release. Archiva respaldos antiguos desde GitHub.');
}
async function upload(api,release,name,body,type){
  const result=await api('POST',`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,body,type);
  const hash='sha256:'+crypto.createHash('sha256').update(body).digest('hex');
  if(result.state!=='uploaded'||result.size!==body.length||(result.digest&&result.digest!==hash))throw new Error('GitHub no confirmó el archivo completo. La publicación anterior se conserva.');
  return result;
}
// Stage a new JSON before renaming anything; old assets remain downloadable as backups.
async function replaceContent(api,release,original,body,id){
  const staged=await upload(api,release,`launcher-content-pending-${id}.json`,body,'application/json');
  const current=await api('GET','/releases/latest'),listed=await assets(api,release.id);
  if(current.id!==release.id||listed.find(a=>a.name==='launcher-content.json')?.id!==original?.id)throw new Error('Otra publicación cambió mientras subías. Recarga desde GitHub antes de publicar.');
  if(original)await api('PATCH',`/releases/assets/${original.id}`,{name:`launcher-content-backup-${id}.json`});
  try{await api('PATCH',`/releases/assets/${staged.id}`,{name:'launcher-content.json'});}
  catch(error){
    try{if(original&&!(await assets(api,release.id)).some(a=>a.name==='launcher-content.json'))await api('PATCH',`/releases/assets/${original.id}`,{name:'launcher-content.json'});}
    catch{throw new Error('No se pudo restaurar el nombre del JSON. En GitHub, renombra launcher-content-backup-'+id+'.json a launcher-content.json.');}
    throw error;
  }
  return {releaseId:release.id,assetId:staged.id};
}
async function publish({token,content,eventId,packs=[],replaceAll=false,removeIds=[],base,report=()=>{},transport=request,getFeed=core.fetchJson}){
  const api=client(token,transport);await authorize(token,transport);
  const candidate=core.validateContent(structuredClone(content)),event=candidate.events.find(e=>e.id===eventId);
  if(!event)throw new Error('Selecciona un evento válido.');
  const release=await api('GET','/releases/latest');
  if(release.immutable)throw new Error('Esta release es inmutable. Crea una nueva release editable en GitHub.');
  const listed=await assets(api,release.id),original=listed.find(a=>a.name==='launcher-content.json');
  if(base&&((original?.id||0)!==base.assetId||release.id!==base.releaseId))throw new Error('Otro administrador actualizó el contenido. Carga desde GitHub antes de publicar para no sobrescribirlo.');
  const id=Date.now().toString(36)+'-'+crypto.randomBytes(4).toString('hex');
  if(typeof replaceAll!=='boolean'||!Array.isArray(removeIds)||removeIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))throw new Error('Cambios de packs inválidos.');
  if(packs.length||removeIds.length||replaceAll){
    const feed=!replaceAll&&event.manifestUrl?core.validateFeed(await getFeed(event.manifestUrl)):{schema:1,packs:[]};
    if(replaceAll&&!packs.length)throw new Error('Selecciona el conjunto completo antes de reemplazar.');
    removeIds=removeIds.map(id=>id.toLowerCase());
    feed.packs=feed.packs.filter(p=>!removeIds.includes(p.uuid.toLowerCase())).map(({file,...pack})=>pack);
    let index=0;
    for(const pack of packs){
      report(`Subiendo pack ${++index} de ${packs.length}…`);
      const body=await fsp.readFile(pack.file);
      if(crypto.createHash('sha256').update(body).digest('hex')!==pack.sha256)throw new Error('El archivo preparado cambió. Selecciona el addon otra vez.');
      const previous=feed.packs.find(p=>p.uuid.toLowerCase()===pack.uuid.toLowerCase());
      if(previous&&previous.sha256.toLowerCase()===pack.sha256.toLowerCase()&&previous.kind===pack.kind&&JSON.stringify(previous.version)===JSON.stringify(pack.version)){report('Sin cambios: '+(pack.name||pack.uuid));continue;}
      const name=`${pack.uuid}-${pack.version.join('.')}-${id}.mcpack`;
      const asset=await upload(api,release,name,body,'application/zip');
      const p={uuid:pack.uuid,version:pack.version,kind:pack.kind,name:pack.name,sha256:pack.sha256,url:asset.browser_download_url};
      if(pack.dependencies?.length)p.dependencies=pack.dependencies;
      core.validateFeed({schema:1,packs:[p]});
      feed.packs=feed.packs.filter(old=>old.uuid.toLowerCase()!==p.uuid.toLowerCase());feed.packs.push(p);
    }
    core.validateFeed(feed);report('Subiendo manifiesto verificado…');
    const asset=await upload(api,release,`event-${event.id}-${id}.json`,Buffer.from(JSON.stringify(feed,null,2)),'application/json');
    if(candidate.manifestUrl===event.manifestUrl)candidate.manifestUrl=asset.browser_download_url;
    event.manifestUrl=asset.browser_download_url;
  }
  report('Publicando contenido…');core.validateContent(candidate);
  const nextBase=await replaceContent(api,release,original,Buffer.from(JSON.stringify(candidate,null,2)),id);
  report('Publicado en GitHub.');return {content:candidate,url:release.html_url,base:nextBase};
}
async function exportPacks(feed,destination,stage,{get=core.download}={}){
  core.validateFeed(feed);
  const files=[];
  for(const pack of feed.packs){
    const file=path.join(stage,pack.uuid+'.mcpack');
    if(pack.file){if(crypto.createHash('sha256').update(await fsp.readFile(pack.file)).digest('hex')!==pack.sha256)throw new Error('Un pack preparado cambió.');files.push({file:pack.file,name:pack.uuid+'.mcpack'});}
    else{await get(pack.url,file,pack.sha256,()=>{});files.push({file,name:pack.uuid+'.mcpack'});}
  }
  await new Promise((resolve,reject)=>{
    const output=fs.createWriteStream(destination,{flags:'wx'}),zip=archiver('zip',{zlib:{level:6}});
    output.on('close',resolve);output.on('error',reject);zip.on('error',reject);zip.on('warning',reject);zip.pipe(output);
    for(const file of files)zip.file(file.file,{name:file.name});zip.finalize().catch(reject);
  });
}
async function snapshot(token,transport=request){
  const api=client(token,transport),release=await api('GET','/releases/latest');
  const list=await assets(api,release.id),asset=list.find(a=>a.name==='launcher-content.json');
  return {releaseId:release.id,assetId:asset?.id||0};
}
module.exports={REPO,authorize,prepareAddon,prepareAddons,packPlan,publish,snapshot,replaceContent,client,exportPacks};
