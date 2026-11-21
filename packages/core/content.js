// IPv6 grammar adapted from Node.js v24.14.0 internal/net.js (MIT; LICENSE.node).
const {https}=require('./index');
const v4Seg = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])';
const v4Str = `(?:${v4Seg}\\.){3}${v4Seg}`;

// IPv6 Segment
const v6Seg = '(?:[0-9a-fA-F]{1,4})';
const IPv6Reg = new RegExp('^(?:' +
  `(?:${v6Seg}:){7}(?:${v6Seg}|:)|` +
  `(?:${v6Seg}:){6}(?:${v4Str}|:${v6Seg}|:)|` +
  `(?:${v6Seg}:){5}(?::${v4Str}|(?::${v6Seg}){1,2}|:)|` +
  `(?:${v6Seg}:){4}(?:(?::${v6Seg}){0,1}:${v4Str}|(?::${v6Seg}){1,3}|:)|` +
  `(?:${v6Seg}:){3}(?:(?::${v6Seg}){0,2}:${v4Str}|(?::${v6Seg}){1,4}|:)|` +
  `(?:${v6Seg}:){2}(?:(?::${v6Seg}){0,3}:${v4Str}|(?::${v6Seg}){1,5}|:)|` +
  `(?:${v6Seg}:){1}(?:(?::${v6Seg}){0,4}:${v4Str}|(?::${v6Seg}){1,6}|:)|` +
  `(?::(?:(?::${v6Seg}){0,5}:${v4Str}|(?::${v6Seg}){1,7}|:))` +
')(?:%[0-9a-zA-Z-.:]{1,})?$');


function validHost(host) {
  return typeof host === 'string' && (IPv6Reg.test(host) || (host.length <= 253 && host.split('.').every(s => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s))));
}
function connectUri(host, port) {
  if (!validHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('La dirección o el puerto del evento no son válidos.');
  return `minecraft://connect?serverUrl=${encodeURIComponent(host)}&serverPort=${port}`;
}
// VCMC Android 2.3.5 opens the connect/ path; keep the desktop URI unchanged.
function androidConnectUri(host,port){return connectUri(host,port).replace('minecraft://connect?','minecraft://connect/?');}

function utf8Bytes(text){let bytes=0;for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);bytes+=code<128?1:code<2048?2:3;if(code>=0xd800&&code<=0xdbff&&i+1<text.length){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){bytes++;i++;}}}return bytes;}

function validateContent(c) {
  if (c?.schema !== 1) throw new Error('La publicación no tiene un formato válido.');
  connectUri(c.server, c.port); https(c.manifestUrl);
  if (typeof c.discordApplicationId !== 'string' || (c.discordApplicationId && !/^\d{17,20}$/.test(c.discordApplicationId))) throw new Error('El ID de aplicación de Discord no es válido.');
  for (const [key, limit] of [['headline', 100], ['message', 1000]]) if (typeof c[key] !== 'string' || c[key].length > limit) throw new Error(`Revisa el campo ${key === 'headline' ? 'titular' : 'mensaje'}.`);
  if (!Array.isArray(c.notices) || c.notices.length > 20) throw new Error('Puedes publicar hasta 20 avisos.');
  for (const n of c.notices) for (const [key, max] of [['tag', 30], ['title', 100], ['text', 1500]]) if (typeof n[key] !== 'string' || !n[key].trim() || n[key].length > max) throw new Error('Revisa los títulos y textos de los avisos.');
  const result = { schema: 1, server: c.server, port: c.port, manifestUrl: c.manifestUrl, discordApplicationId: c.discordApplicationId,
    headline: c.headline, message: c.message, notices: c.notices.map(n => ({tag: n.tag, title: n.title, text: n.text})), changes: require('./calendar').validate(c.changes), events: validateEvents(c) };
  if (utf8Bytes(JSON.stringify(result)) > 2 * 1024 * 1024) throw new Error('La publicación supera 2 MB. Reduce los textos o archiva cambios antiguos.');
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

module.exports={connectUri,androidConnectUri,validateContent,utf8Bytes};
