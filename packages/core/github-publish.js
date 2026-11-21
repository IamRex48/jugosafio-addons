const {Buffer}=require('buffer');
const core={...require('./index'),...require('./content')};
const REPO='IamRex48/jugosafio-addons';
const API=`https://api.github.com/repos/${REPO}`;
function createPublisher({request,readPack,sha256,uniqueId,fetchFeed}){
function client(token,transport=request){return (method,route,body,type)=>transport(token,method,route.startsWith('https:')?route:API+route,body,type);}
async function authorize(token,transport=request){
  if(typeof token!=='string'||!/^\S{20,255}$/.test(token))throw new Error('Pega un token válido de GitHub.');
  const api=client(token,transport),repo=await api('GET','');
  if(repo.private||!repo.permissions?.push)throw new Error('Necesitas acceso de escritura al repositorio público de Fonyx.');
  const user=await api('GET','https://api.github.com/user');
  return {login:user.login,repo:REPO};
}
async function assets(api,id){
  const all=[];for(let page=1;page<=100;page++){const batch=await api('GET',`/releases/${id}/assets?per_page=100&page=${page}`);all.push(...batch);if(batch.length<100)return all;}
  throw new Error('Demasiados archivos en esta release. Archiva respaldos antiguos desde GitHub.');
}
async function upload(api,release,name,body,type){
  const result=await api('POST',`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,body,type);
  const hash='sha256:'+sha256(body);
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
async function publish({token,content,eventId,packs=[],replaceAll=false,removeIds=[],base,report=()=>{},transport=request,getFeed=fetchFeed}){
  const api=client(token,transport);await authorize(token,transport);
  const candidate=core.validateContent(content),event=candidate.events.find(e=>e.id===eventId);
  if(!event)throw new Error('Selecciona un evento válido.');
  const release=await api('GET','/releases/latest');
  if(release.immutable)throw new Error('Esta release es inmutable. Crea una nueva release editable en GitHub.');
  const listed=await assets(api,release.id),original=listed.find(a=>a.name==='launcher-content.json');
  if(base&&((original?.id||0)!==base.assetId||release.id!==base.releaseId))throw new Error('Otro administrador actualizó el contenido. Carga desde GitHub antes de publicar para no sobrescribirlo.');
  const id=uniqueId();
  if(typeof replaceAll!=='boolean'||!Array.isArray(removeIds)||removeIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))throw new Error('Cambios de packs inválidos.');
  if(packs.length||removeIds.length||replaceAll){
    const feed=!replaceAll&&event.manifestUrl?core.validateFeed(await getFeed(event.manifestUrl)):{schema:1,packs:[]};
    if(replaceAll&&!packs.length)throw new Error('Selecciona el conjunto completo antes de reemplazar.');
    removeIds=removeIds.map(id=>id.toLowerCase());
    feed.packs=feed.packs.filter(p=>!removeIds.includes(p.uuid.toLowerCase())).map(({file,...pack})=>pack);
    let index=0;
    for(const pack of packs){
      report(`Subiendo pack ${++index} de ${packs.length}…`);
      const body=await readPack(pack.file);
      if(sha256(body)!==pack.sha256)throw new Error('El archivo preparado cambió. Selecciona el addon otra vez.');
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
async function snapshot(token,transport=request){
  const api=client(token,transport),release=await api('GET','/releases/latest');
  const list=await assets(api,release.id),asset=list.find(a=>a.name==='launcher-content.json');
  return {releaseId:release.id,assetId:asset?.id||0};
}

return {REPO,client,authorize,replaceContent,publish,snapshot};
}
module.exports={REPO,createPublisher};
