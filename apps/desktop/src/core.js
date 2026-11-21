const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const yauzl = require('yauzl');
const exec = promisify(execFile);
const BRAND_ID = '143fd6c0-c67c-4e36-9baa-68884ec01b62';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function validHost(host) {
  return typeof host === 'string' && (net.isIP(host) || (host.length <= 253 && host.split('.').every(s => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s))));
}
function connectUri(host, port) {
  if (!validHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('La dirección o el puerto del evento no son válidos.');
  return `minecraft://connect?serverUrl=${encodeURIComponent(host)}&serverPort=${port}`;
}
const {https,validateFeed}=require('../../../packages/core');
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
async function readJson(file) { return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
async function atomicText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  await fsp.writeFile(temp, text, { flag: 'wx' });
  try {
    try { await fsp.copyFile(file, file + '.bak'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fsp.rename(temp, file);
  } finally { await fsp.rm(temp, { force: true }); }
}
async function atomicJson(file, value) { await atomicText(file, JSON.stringify(value, null, 2) + '\n'); }
async function registerServer(profile, host, port, name = 'JUGOSAFIO R') {
  connectUri(host, port); await rootCheck(profile);
  // shortcut: el formato local con separadores ':' se usa solo con dominios e IPv4; revisar el formato del juego antes de admitir IPv6 aquí.
  if (host.includes(':')) throw new Error('El registro de servidores guardados necesita un dominio o una dirección IPv4.');
  const file = path.join(profile, 'minecraftpe', 'external_servers.txt');
  await safeDirectory(path.dirname(file));
  let text = '';
  try { text = await fsp.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let maxId = 0;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const entry = /^(\d+):([^:]*):([^:]+):(\d+):(\d+)$/.exec(line);
    if (!entry) continue;
    const id = Number(entry[1]); if (!Number.isSafeInteger(id)) throw new Error('La lista de servidores guardados tiene un identificador inválido.');
    maxId = Math.max(maxId, id);
    if (entry[3].toLowerCase() === host.toLowerCase() && Number(entry[4]) === port) return false;
  }
  if (!Number.isSafeInteger(maxId + 1)) throw new Error('La lista de servidores guardados tiene demasiadas entradas.');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const separator = text && !text.endsWith('\n') ? newline : '';
  await atomicText(file, text + separator + `${maxId + 1}:${name.replace(/[:\r\n]/g,' ')}:${host}:${port}:${Math.floor(Date.now() / 1000)}` + newline);
  return true;
}
async function safeDirectory(dir) {
  for (let current = path.resolve(dir); ;) {
    try { if ((await fsp.lstat(current)).isSymbolicLink()) throw new Error('La carpeta de packs no puede ser un enlace o una unión de carpetas.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
async function rootCheck(root) {
  let exists = false;
  if (root && path.basename(root).toLowerCase() === 'com.mojang') {
    try { exists = (await fsp.stat(root)).isDirectory(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!exists) throw new Error('Selecciona tu carpeta com.mojang de Minecraft en Ajustes.');
  await safeDirectory(root);
}
async function gameRunning() {
  if (process.platform !== 'win32') return false;
  const { stdout } = await exec('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq Minecraft.Windows*'], { windowsHide: true, timeout: 10000 });
  return /"Minecraft\.Windows(?:\.Preview)?\.exe"/i.test(stdout);
}
async function requireClosed() { if (await gameRunning()) throw new Error('Cierra Minecraft antes de actualizar los recursos.'); }
async function response(url, timeout = 900000) {
  const request = require('./network').platformFetch;
  const options = {signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'FonyxLauncher/1.2'},cache:'no-store',redirect:'manual'};
  let target = https(url);
  for (let redirects = 0; redirects < 6; redirects++) {
    const res = await request(target, options);
    if ([301,302,303,307,308].includes(res.status)) {
      await res.body?.cancel();
      target = https(new URL(res.headers.get('location'), target).href); continue;
    }
    if (!res.ok) {await res.body?.cancel();throw new Error(`No se pudo descargar ${new URL(url).pathname.split('/').pop()} (HTTP ${res.status}). Revisa el archivo y su enlace en GitHub.`);}
    https(res.url);return res;
  }
  throw new Error('La descarga redirige demasiadas veces.');
}
async function fetchJson(url, timeout = 15000) {
  const res = await response(url, timeout);
  const parts = []; let size = 0;
  for await (const part of Readable.fromWeb(res.body)) { size += part.length; if (size > 2 * 1024 * 1024) throw new Error('El manifiesto es demasiado grande.'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/, ''));
}
async function download(url, file, expected, report) {
  const res = await response(url);
  const size = Number(res.headers.get('content-length')) || 0;
  if (size > 1024 ** 3) throw new Error('El pack supera 1 GiB.');
  const hash = crypto.createHash('sha256'); let count = 0, last = 0;
  await pipeline(Readable.fromWeb(res.body), new Transform({ transform(chunk, _, done) {
    count += chunk.length; hash.update(chunk);
    if (count > 1024 ** 3) return done(new Error('El pack supera 1 GiB.'));
    if (Date.now() - last > 150) { report({ bytes: count, total: size }); last = Date.now(); }
    done(null, chunk);
  } }), fs.createWriteStream(file, { flags: 'wx' }));
  if (size && count !== size) throw new Error('La descarga quedó incompleta. Vuelve a intentarlo.');
  if (hash.digest('hex') !== expected.toLowerCase()) throw new Error('La huella SHA-256 del pack no coincide. No se instalará esta descarga.');
}
async function matches(folder, pack) {
  try {
    const m = await readJson(path.join(folder, 'manifest.json'));
    return typeof m?.header?.uuid === 'string' && m.header.uuid.toLowerCase() === pack.uuid.toLowerCase() && JSON.stringify(m.header.version) === JSON.stringify(pack.version) && Array.isArray(m.modules) && m.modules.some(x => x?.type === pack.kind || (pack.kind==='data'&&x?.type==='script'));
  } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return false; throw e; }
}
async function locatePack(dir, pack, stage, budget, state = { nested: 0, extracted: new Map(), claimed: new Set() }, depth = 0) {
  if (depth > 5) return null;
  if (fs.existsSync(path.join(dir, 'manifest.json'))) {
    if (!state.claimed.has(dir) && await matches(dir, pack)) { state.claimed.add(dir); return dir; }
    return null;
  }
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await locatePack(item, pack, stage, budget, state, depth + 1);
      if (found) return found;
    } else if (/\.(mcpack|mcaddon|zip)$/i.test(entry.name)) {
      let target = state.extracted.get(item);
      if (!target) {
        if (++state.nested > 100) throw new Error('El pack contiene demasiados archivos anidados.');
        target = path.join(stage, 'nested-' + state.nested);
        await fsp.mkdir(target); await extract(item, target, budget);
        state.extracted.set(item, target);
      }
      const found = await locatePack(target, pack, stage, budget, state, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
function targetFor(root, p) { return path.join(root, p.kind === 'resources' ? 'resource_packs' : 'behavior_packs', 'jugosafio_' + p.uuid.toLowerCase()); }
async function current(folder, pack) {
  try { return (await fsp.readFile(path.join(folder, '.jugosafio-sha256'), 'utf8')).trim().toLowerCase() === pack.sha256.toLowerCase() && await matches(folder, pack); }
  catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return false; throw e; }
}
function extract(archive, dest, budget = {bytes:0,entries:0}) {
  return new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      let total = 0, entries = 0, failed = false;
      const seen = new Set();
      const fail = e => { if (!failed) { failed = true; zip.close(); reject(e); } };
      zip.on('error', fail); zip.on('end', resolve);
      zip.on('entry', async e => {
        try {
          const name = e.fileName.replace(/\\/g, '/');
          if (++entries > 50000 || (total += e.uncompressedSize) > 2 * 1024 ** 3 || ++budget.entries>50000 || (budget.bytes+=e.uncompressedSize)>2*1024**3) throw new Error('El pack contiene demasiados archivos o supera 2 GiB al extraerse.');
          if (name.startsWith('/') || name.includes(':') || name.split('/').some(s => s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)) || ((e.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('El pack contiene una ruta de archivo insegura.');
          const target = path.resolve(dest, name);
          const relative = path.relative(dest, target);
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || seen.has(target.toLowerCase())) throw new Error('El pack contiene una ruta repetida o inválida.');
          seen.add(target.toLowerCase());
          if (name.endsWith('/')) await fsp.mkdir(target, { recursive: true });
          else {
            await fsp.mkdir(path.dirname(target), { recursive: true });
            const input = await new Promise((res, rej) => zip.openReadStream(e, (err, stream) => err ? rej(err) : res(stream)));
            await pipeline(input, fs.createWriteStream(target, { flags: 'wx' }));
          }
          if (!failed) zip.readEntry();
        } catch (e) { fail(e); }
      });
      zip.readEntry();
    });
  });
}
async function updatePacks(root, feed, report, { get = download, checkClosed = requireClosed, rename = fsp.rename } = {}) {
  await rootCheck(root); validateFeed(feed); await checkClosed();
  const stage = await fsp.mkdtemp(path.join(root, '.jugosafio-stage-'));
  const pending = [], applied = [], shared = new Map(), state = { nested: 0, extracted: new Map(), claimed: new Set() };
  let preserve = false, index = 0;
  try {
    for (const p of feed.packs) {
      const target = targetFor(root, p); await safeDirectory(target);
      index++;
      report({ phase: 'check', index, count: feed.packs.length, message: `Revisando pack ${index} de ${feed.packs.length}` });
      if (await current(target, p)) continue;
      if (fs.existsSync(target) && !fs.existsSync(path.join(target, '.jugosafio-sha256'))) throw new Error('Ya existe una carpeta de packs ajena al launcher. Se conservará: ' + target);
      const key = `${p.url}#${p.sha256.toLowerCase()}`;
      let entry = shared.get(key);
      if (!entry) {
        const archive = path.join(stage, p.uuid + '.zip'), raw = path.join(stage, p.uuid), budget = { bytes: 0, entries: 0 };
        await get(p.url, archive, p.sha256, progress => report({phase: 'download', index, count: feed.packs.length, message: `Descargando pack ${index} de ${feed.packs.length}`, ...progress}));
        await fsp.mkdir(raw); await extract(archive, raw, budget);
        entry = { raw, budget }; shared.set(key, entry);
      }
      const unpacked = await locatePack(entry.raw, p, stage, entry.budget, state);
      if (!unpacked) throw new Error(`El UUID, la versión o el tipo del pack no coincide con el manifiesto.\nPack: ${p.uuid}\nVersión requerida: ${p.version.join('.')}\nTipo: ${p.kind === 'resources' ? 'recursos (RP)' : 'comportamiento (BP)'}\nEl archivo descargado debe incluir ese pack con un manifest.json válido. Revisa la publicación del evento en GitHub.`);
      await fsp.writeFile(path.join(unpacked, '.jugosafio-sha256'), p.sha256.toLowerCase());
      pending.push({ target, unpacked, backup: path.join(stage, p.uuid + '.previous') });
    }
    await checkClosed();
    report({phase: 'install', message: 'Instalando los recursos verificados…'});
    for (const c of pending) {
      await fsp.mkdir(path.dirname(c.target), { recursive: true });
      if (fs.existsSync(c.target)) await rename(c.target, c.backup);
      applied.push(c); await rename(c.unpacked, c.target);
    }
    return pending.length;
  } catch (error) {
    try {
      for (const c of applied.reverse()) {
        await fsp.rm(c.target, { recursive: true, force: true });
        if (fs.existsSync(c.backup)) await fsp.rename(c.backup, c.target);
      }
    } catch (rollback) { preserve = true; throw new Error(`No se pudo restaurar la actualización. Conservamos las copias anteriores en ${stage}. ${rollback.message}`); }
    throw error;
  } finally {
    // shortcut: ante un cierre forzado durante los intercambios, recuperar las carpetas .previous de staging manualmente.
    if (!preserve) await fsp.rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}
// Migration only: remove the old automatic global-pack entry without loading its manifest.
// This never activates a pack or removes unrelated global resources.
async function removeLegacyGlobalPack(profile) {
  await rootCheck(profile);
  const file = path.join(profile, 'minecraftpe', 'global_resource_packs.json');
  let list;
  try { list = await readJson(file); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
  if (!Array.isArray(list)) return false;
  const next = list.filter(pack => typeof pack?.pack_id !== 'string' || pack.pack_id.toLowerCase() !== BRAND_ID);
  if (next.length === list.length) return false;
  await safeDirectory(path.dirname(file)); await atomicJson(file, next);
  return true;
}
async function resolveMinecraftFolder(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Selecciona la carpeta de datos de Minecraft.');
  const selected = path.resolve(value.trim().replace(/^"|"$/g, ''));
  const candidates = [selected, path.join(selected,'games','com.mojang'), path.join(selected,'com.mojang'), path.join(selected,'Users','Shared','games','com.mojang'), path.join(selected,'Shared','games','com.mojang'), path.join(selected,'LocalState','games','com.mojang')];
  let parent = selected;
  while (path.dirname(parent) !== parent) { if (path.basename(parent).toLowerCase() === 'com.mojang') candidates.push(parent); parent = path.dirname(parent); }
  for (const candidate of candidates) {
    try { await rootCheck(candidate); return candidate; } catch (error) { if (!error.message.startsWith('Selecciona')) throw error; }
  }
  throw new Error('No se encontró com.mojang. Abre Minecraft una vez y selecciona su carpeta de datos, no la de instalación de XboxGames.');
}
function detectFolders(customRoot = '') {
  const users = customRoot && path.basename(path.dirname(customRoot)).toLowerCase() === 'games' && path.basename(path.dirname(path.dirname(path.dirname(customRoot)))).toLowerCase() === 'users' ? path.dirname(path.dirname(path.dirname(customRoot))) : path.join(process.env.APPDATA || '', 'Minecraft Bedrock', 'Users');
  const shared = path.join(users, 'Shared', 'games', 'com.mojang');
  const legacy = path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang');
  const profiles = fs.existsSync(users) ? fs.readdirSync(users, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.toLowerCase() !== 'shared').map(d => ({ name: d.name, path: path.join(users, d.name, 'games', 'com.mojang') })).filter(d => fs.existsSync(d.path)) : [];
  if (customRoot && fs.existsSync(customRoot) && !profiles.some(p=>p.path===customRoot) && path.basename(path.dirname(path.dirname(customRoot))).toLowerCase()!=='shared') profiles.push({name:'Perfil seleccionado',path:customRoot});
  if (!customRoot && !profiles.length && fs.existsSync(legacy)) profiles.push({ name: 'Minecraft clásico (UWP)', path: legacy });
  profiles.forEach((profile,index) => {
    let username = '';
    try { username = /^mp_username:(.+)$/m.exec(fs.readFileSync(path.join(profile.path,'minecraftpe','options.txt'),'utf8'))?.[1]?.trim() || ''; } catch {}
    profile.name = username && !/^\d+$/.test(username) ? username.slice(0,40) : `Perfil local ${String.fromCharCode(65+index)}`;
    profile.worlds = 0;
    try { profile.worlds = fs.readdirSync(path.join(profile.path,'minecraftWorlds'),{withFileTypes:true}).filter(d=>d.isDirectory()).length; } catch {}
  });
  return { root: customRoot && fs.existsSync(customRoot) ? customRoot : fs.existsSync(shared) ? shared : fs.existsSync(legacy) ? legacy : '', profiles };
}
module.exports = { BRAND_ID, https, connectUri, validateFeed, validateContent, readJson, atomicJson, atomicText, registerServer, safeDirectory, rootCheck, gameRunning, requireClosed, fetchJson, download, matches, targetFor, extract, current, updatePacks, removeLegacyGlobalPack, detectFolders, resolveMinecraftFolder };
