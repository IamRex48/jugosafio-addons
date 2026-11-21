'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function https(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('La dirección de actualización no es válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Las descargas deben usar una dirección HTTPS pública.');
  return url.href;
}
function version(v) { return Array.isArray(v) && v.length === 3 && v.every(n => Number.isInteger(n) && n >= 0); }
function validateFeed(feed) {
  if (feed?.schema !== 1 || !Array.isArray(feed.packs) || feed.packs.length > 100) throw new Error('El manifiesto de packs no tiene un formato válido.');
  const ids = new Set();
  for (const p of feed.packs) {
    if (!UUID.test(p.uuid) || !['resources', 'data'].includes(p.kind) || !version(p.version) || !/^[0-9a-f]{64}$/i.test(p.sha256)) throw new Error('Hay un pack con datos inválidos en el manifiesto.');
    https(p.url);
    if (new URL(p.url).pathname.startsWith('/OWNER/REPO/')) throw new Error('El manifiesto publicado todavía usa OWNER/REPO. Reemplázalo por el archivo con los enlaces reales de GitHub.');
    if (ids.has(p.uuid.toLowerCase())) throw new Error('El manifiesto repite el identificador de un pack.');
    ids.add(p.uuid.toLowerCase());
  }
  return feed;
}
function packPlan(current,incoming,{replaceAll=false,removeIds=[]}={}){
  const removed=new Set(removeIds.map(id=>id.toLowerCase())),old=new Map(current.map(p=>[p.uuid.toLowerCase(),p]));
  const final=new Map((replaceAll?[]:current).filter(p=>!removed.has(p.uuid.toLowerCase())).map(p=>[p.uuid.toLowerCase(),p]));
  for(const p of incoming)final.set(p.uuid.toLowerCase(),p);
  return [...final.values()].map(p=>{
    const before=old.get(p.uuid.toLowerCase());
    const selected=incoming.some(n=>n.uuid.toLowerCase()===p.uuid.toLowerCase());
    const same=before&&before.sha256.toLowerCase()===p.sha256.toLowerCase()&&JSON.stringify(before.version)===JSON.stringify(p.version)&&before.kind===p.kind;
    const status=!before?'new':selected?(same?'unchanged':'update'):'current';
    const warnings=[];
    for(const dependency of Array.isArray(p.dependencies)?p.dependencies:[]){
      if(typeof dependency?.uuid!=='string')continue;
      const found=final.get(dependency.uuid.toLowerCase());
      if(!found)warnings.push('Falta la dependencia '+dependency.uuid);
      else if(Array.isArray(dependency.version)&&JSON.stringify(dependency.version)!==JSON.stringify(found.version))warnings.push('La dependencia '+dependency.uuid+' requiere '+dependency.version.join('.')+'; la selección contiene '+found.version.join('.')+'.');
    }
    if(before&&p.version.some((n,i)=>n!==before.version[i])){
      const index=p.version.findIndex((n,i)=>n!==before.version[i]);
      if(p.version[index]<before.version[index])warnings.push('Versión anterior a la publicada ('+before.version.join('.')+').');
    }
    return {...p,status,warnings};
  });
}
module.exports={https,validateFeed,packPlan,calendar:require('./calendar')};
