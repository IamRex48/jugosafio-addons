// Frozen beta.3 PC reference. Do not edit to make a test pass.
const net=require('node:net');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function https(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('La dirección de actualización no es válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Las descargas deben usar una dirección HTTPS pública.');
  return url.href;
}
function validHost(host) {
  return typeof host === 'string' && (net.isIP(host) || (host.length <= 253 && host.split('.').every(s => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s))));
}
function connectUri(host, port) {
  if (!validHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('La dirección o el puerto del evento no son válidos.');
  return `minecraft://connect?serverUrl=${encodeURIComponent(host)}&serverPort=${port}`;
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
function validateContent(c) {
  if (c?.schema !== 1) throw new Error('La publicación no tiene un formato válido.');
  connectUri(c.server, c.port); https(c.manifestUrl);
  if (typeof c.discordApplicationId !== 'string' || (c.discordApplicationId && !/^\d{17,20}$/.test(c.discordApplicationId))) throw new Error('El ID de aplicación de Discord no es válido.');
  for (const [key, limit] of [['headline', 100], ['message', 1000]]) if (typeof c[key] !== 'string' || c[key].length > limit) throw new Error(`Revisa el campo ${key === 'headline' ? 'titular' : 'mensaje'}.`);
  if (!Array.isArray(c.notices) || c.notices.length > 20) throw new Error('Puedes publicar hasta 20 avisos.');
  for (const n of c.notices) for (const [key, max] of [['tag', 30], ['title', 100], ['text', 1500]]) if (typeof n[key] !== 'string' || !n[key].trim() || n[key].length > max) throw new Error('Revisa los títulos y textos de los avisos.');
  const result = { schema: 1, server: c.server, port: c.port, manifestUrl: c.manifestUrl, discordApplicationId: c.discordApplicationId,
    headline: c.headline, message: c.message, notices: c.notices.map(n => ({tag: n.tag, title: n.title, text: n.text})), changes: require('./calendar').validate(c.changes), events: validateEvents(c) };
  if (Buffer.byteLength(JSON.stringify(result)) > 2 * 1024 * 1024) throw new Error('La publicación supera 2 MB. Reduce los textos o archiva cambios antiguos.');
  return result;
}
function validateEvents(content) {
  const events = content.events || [
    {id:'jugosafio',name:'Jugosafio R',enabled:true,server:content.server,port:content.port,manifestUrl:content.manifestUrl,logo:'assets/jugosafio.png',studioLogo:'assets/fonyx-jugosafio-animated.webp',background:'assets/map.png',accent:'#ffd465',headline:content.headline,message:content.message,notices:content.notices,changes:content.changes || {}},
    {id:'bedrock',name:'Experimento Bedrock',enabled:false,server:'',port:19132,manifestUrl:'',logo:'assets/experimento-bedrock.png',studioLogo:'assets/experimento-bedrock.png',background:'assets/experimento-bedrock.png',accent:'#ffad52',headline:'',message:'',notices:[],changes:{}}
  ];
  if (!Array.isArray(events) || !events.length || events.length > 16) throw new Error('La publicación admite entre 1 y 16 eventos.');
  const ids = new Set();
  function image(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Imagen de evento inválida.');
    if (/^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(png|webp|gif|jpe?g)$/i.test(value) && !value.includes('..')) return value;
    return https(value);
  }
  return events.map(event => {
    if (!event || !/^[a-z][a-z0-9-]{0,39}$/.test(event.id) || ids.has(event.id) || typeof event.name !== 'string' || !event.name.trim() || event.name.length > 60 || typeof event.enabled !== 'boolean') throw new Error('Revisa el nombre y el identificador de los eventos.');
    ids.add(event.id);
    if (typeof event.server !== 'string' || typeof event.manifestUrl !== 'string' || !Number.isInteger(event.port) || event.port < 1 || event.port > 65535) throw new Error('Conexión del evento inválida.');
    if (event.server || event.enabled) connectUri(event.server,event.port);
    if (event.voiceEnabled!==undefined && typeof event.voiceEnabled!=='boolean') throw new Error('Ajuste de voz inválido.');
    if (event.manifestUrl) https(event.manifestUrl);
    let bankEndpoint='';
    if(event.bankEndpoint){
      https(event.bankEndpoint);const url=new URL(event.bankEndpoint);
      if(url.pathname!=='/'||url.search||url.hash||event.bankEndpoint.length>2048)throw new Error('El banco necesita un origen HTTPS sin rutas.');
      bankEndpoint=url.origin;
    }
    if (!/^#[0-9a-f]{6}$/i.test(event.accent)) throw new Error('Revisa el color del evento.');
    for (const [key,limit] of [['headline',100],['message',1000]]) if (typeof event[key] !== 'string' || event[key].length > limit) throw new Error('Texto de evento inválido.');
    if (!Array.isArray(event.notices) || event.notices.length > 20) throw new Error('Puedes publicar hasta 20 avisos por evento.');
    for (const notice of event.notices) for (const [key,max] of [['tag',30],['title',100],['text',1500]]) if (typeof notice?.[key] !== 'string' || !notice[key].trim() || notice[key].length > max) throw new Error('Aviso de evento inválido.');
    return {id:event.id,name:event.name.trim(),enabled:event.enabled,server:event.server,port:event.port,manifestUrl:event.manifestUrl,bankEndpoint,voiceEnabled:event.voiceEnabled??(event.id==='jugosafio'),logo:image(event.logo),studioLogo:image(event.studioLogo),background:image(event.background),accent:event.accent,headline:event.headline,message:event.message,notices:event.notices.map(n=>({tag:n.tag,title:n.title,text:n.text})),changes:require('./calendar').validate(event.changes)};
  });
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

module.exports={https,connectUri,validateFeed,validateContent,packPlan};
