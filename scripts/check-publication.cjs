const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const REPO='IamRex48/jugosafio-addons';
function https(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
function checkFeed(feed,releases){
  const errors=[],warnings=[],seen=new Set();
  if(feed?.schema!==1||!Array.isArray(feed.packs)||feed.packs.length>100)return {errors:['Manifiesto: schema 1 y lista packs de hasta 100 entradas requeridos.'],warnings};
  for(const pack of feed.packs){
    const label=pack.name||pack.uuid||'Pack sin UUID',uuid=String(pack.uuid||'').toLowerCase();
    if(!UUID.test(uuid))errors.push(`${label}: UUID inválido.`);
    if(seen.has(uuid))errors.push(`${label}: UUID repetido ${uuid}.`);seen.add(uuid);
    if(!['data','resources'].includes(pack.kind))errors.push(`${label}: tipo inválido.`);
    if(!Array.isArray(pack.version)||pack.version.length!==3||pack.version.some(n=>!Number.isInteger(n)||n<0))errors.push(`${label}: versión inválida.`);
    if(typeof pack.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(pack.sha256))errors.push(`${label}: SHA-256 inválido.`);
    if(!https(pack.url)){errors.push(`${label}: URL debe usar HTTPS sin credenciales.`);continue;}
    const url=new URL(pack.url),parts=url.pathname.split('/').map(decodeURIComponent);
    if(url.hostname==='github.com'&&parts[1]===REPO.split('/')[0]&&parts[2]===REPO.split('/')[1]&&parts[3]==='releases'&&parts[4]==='download'){
      const tag=parts[5],name=parts.slice(6).join('/'),release=releases.find(r=>r.tag_name===tag),asset=release?.assets.find(a=>a.name===name);
      if(!release)errors.push(`${label}: release ${tag} no encontrada.`);
      else if(!asset)errors.push(`${label}: falta ${name} en ${tag}.`);
      else if(asset.digest&&asset.digest.toLowerCase()!==`sha256:${pack.sha256}`.toLowerCase())errors.push(`${label}: SHA-256 no coincide con el asset publicado.`);
    }else warnings.push(`${label}: verificar por separado el archivo alojado fuera de las releases inventariadas.`);
    if(/\.mcaddon$/i.test(url.pathname))warnings.push(`${label}: archivo combinado; comprobar UUID y versión internos con el importador del launcher actual.`);
  }
  for(const pack of feed.packs)for(const dep of pack.dependencies||[]){
    if(dep.uuid&&!seen.has(String(dep.uuid).toLowerCase()))errors.push(`${pack.uuid}: dependencia ${dep.uuid} no incluida.`);
  }
  return {errors,warnings};
}
async function json(url,{fetchImpl=fetch,authenticated=false}={}){
  if(!https(url))throw new Error('Se rechazó una fuente sin HTTPS.');
  const headers={'User-Agent':'Fonyx-Publication-Check','Accept':'application/json'};
  if(authenticated&&new URL(url).hostname==='api.github.com'&&process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`HTTP ${response.status} al consultar ${new URL(url).pathname}`);
  const reader=response.body.getReader();let bytes=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;if((bytes+=value.length)>4*1024*1024)throw new Error('Respuesta JSON demasiado grande.');chunks.push(value);}}finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function audit({load=json}={}){
  const api=`https://api.github.com/repos/${REPO}`,releases=[];
  for(let page=1;page<=20;page++){const batch=await load(`${api}/releases?per_page=100&page=${page}`,{authenticated:true});releases.push(...batch);if(batch.length<100)break;if(page===20)throw new Error('Inventario demasiado grande; revisión manual requerida.');}
  const latest=await load(api+'/releases/latest',{authenticated:true}),errors=[],warnings=[];
  if(!latest.assets?.some(a=>a.name==='launcher-content.json'))return {ok:false,release:latest.tag_name,errors:['La release latest no contiene launcher-content.json.'],warnings};
  const source=`https://github.com/${REPO}/releases/download/${encodeURIComponent(latest.tag_name)}/launcher-content.json`;
  const content=await load(source),feeds=new Map();
  if(content.schema!==1||!Array.isArray(content.events))errors.push('Contenido: se requiere schema 1 y la lista de eventos del launcher actual.');
  const events=Array.isArray(content.events)?content.events:[];
  for(const event of events){
    if(!event.manifestUrl){if(event.enabled)warnings.push(`${event.id}: evento habilitado sin manifiesto.`);continue;}
    if(!feeds.has(event.manifestUrl)){
      try{feeds.set(event.manifestUrl,checkFeed(await load(event.manifestUrl),releases));}
      catch(error){feeds.set(event.manifestUrl,{errors:[error.message],warnings:[]});}
    }
    const result=feeds.get(event.manifestUrl);errors.push(...result.errors.map(s=>`${event.id}: ${s}`));warnings.push(...result.warnings.map(s=>`${event.id}: ${s}`));
    if(event.manifestUrl.includes('/releases/latest/'))warnings.push(`${event.id}: manifestUrl depende de latest; una release nueva puede cambiar su destino.`);
  }
  return {ok:errors.length===0,release:latest.tag_name,source,checkedEvents:events.length,errors,warnings};
}
if(require.main===module)audit().then(report=>{console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={checkFeed,audit,json};
