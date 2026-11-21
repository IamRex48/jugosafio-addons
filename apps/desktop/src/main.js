require('./stdio');
const { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeImage, safeStorage, clipboard, Tray, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('./core');
const { pingBedrockServer } = require('./bedrock-ping');
const { launchWithEventTrust } = require('./event-trust');
const Discord = require('discord-rpc');
const pkg = require('../package.json');
const calendar = require('./calendar');
const {platformFetch} = require('./network');
const publishing = require('./github-publish');
const {RelaySession,validateOptions:validateVoiceOptions}=require('./voice/relay-session');
const {AddonBridge}=require('./voice/addon-bridge');
const setup=require('./setup');
const {bindings:voiceBindings,startKeys}=require('./voice/keys');
const {BankClient}=require('./bank');
const {AdminRegistry}=require('./administrators');
const REMOTE_CONTENT = 'https://github.com/IamRex48/jugosafio-addons/releases/latest/download/launcher-content.json';
const SOCIALS = { discord: 'https://discord.gg/TAHGBktktU', tiktok: 'https://www.tiktok.com/@fonyx.studios' };
const data = process.env.FONYX_TEST_DATA && !app.isPackaged ? path.resolve(process.env.FONYX_TEST_DATA) : path.join(app.getPath('appData'), 'FonyxLauncher');
app.setPath('userData', path.join(data, 'runtime'));
let win, content, settings, rpc, busy = false, rpcMessage = 'Discord sin configurar', contentSource = 'Publicación incluida';
let trustSession, quitting = false;
let tray = null, exitRequested=false;
let githubToken='', githubLogin='', githubBase=null, addonStage='', addonPacks=[],packEventId='',addonReplace=false,remotePacks=[],removedPackIds=[];
const administrators=new AdminRegistry({
  readCache:async()=>{
    if(!safeStorage.isEncryptionAvailable())return null;
    const saved=await core.readJson(path.join(data,'administrators-cache.json'));
    return JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted,'base64')));
  },
  writeCache:async value=>{
    if(!safeStorage.isEncryptionAvailable())throw new Error('No se puede guardar la lista cifrada.');
    await core.atomicJson(path.join(data,'administrators-cache.json'),{encrypted:safeStorage.encryptString(JSON.stringify(value)).toString('base64')});
  }
});
const voice=new RelaySession();let voiceArmed=false,voiceGranted=false,voiceEventId='',voiceCode='',voiceAwaitBackground=false;
const bundledVoiceEngine=path.join(app.isPackaged?process.resourcesPath:app.getAppPath(),'native','vcmc_realms_proxy.exe');
const verificationMode=()=>adminEnabled()&&settings?.voiceVerification==='bridge'?'bridge':'direct';
const voiceEngine=app.isPackaged?bundledVoiceEngine:process.env.FONYX_VOICE_ENGINE||(fs.existsSync(bundledVoiceEngine)?bundledVoiceEngine:path.join(data,'voice-runtime','vcmc_realms_proxy.exe'));
const bridge=new AddonBridge({executable:voiceEngine,cacheDir:path.join(data,'voice-microsoft')});
const bank=new BankClient({directory:path.join(data,'bank-records'),bridge});
const voiceEvent=event=>{if(win&&!win.isDestroyed())win.webContents.send('voice:event',event);};
bridge.on('event',voiceEvent);
voice.on('event',event=>{if(event.type==='verification-required'){voiceCode=event.value;if(verificationMode()==='bridge')bridge.verify(event.value);}if(['verified','reset'].includes(event.type)){voiceCode='';bridge.cancelVerification();}updateTray();syncHotkeys();voiceEvent(event);if(event.type==='verified'&&voiceArmed&&voiceAwaitBackground){voiceAwaitBackground=false;hideForPlay();}});
const githubStatus=()=>({connected:!!githubToken,login:githubLogin,repo:publishing.REPO,ready:!!githubBase,eventId:packEventId,replaceAll:addonReplace,hasChanges:!!(addonPacks.length||removedPackIds.length||addonReplace),packs:pendingPacks().map(({name,uuid,version,kind,bytes,status,warnings,source})=>({name:name||uuid,uuid,version,kind,bytes,status,warnings,source}))});
// La administración depende de la cuenta de Xbox verificada, no de la distribución instalada.
const isAdminAccount=()=>!!(bridge.identity&&administrators.has(bridge.identity.name));
const adminEnabled=()=>isAdminAccount()&&settings?.userView!==true;
const started = new Date();
const defaults = () => ({ root:core.detectFolders().root, profile: '', discord: true, reducedMotion: false, loadingStyle: 'diamond', trustEvents: true, vanillaMenu: false, profileAliases: {}, profileAvatars: {},minecraftExecutable:'',voiceInput:'',voiceOutput:'',audioConfigured:false,microphoneAllowed:false,setupComplete:false,accountName:'',accountXuid:'',voiceRooms:{},voiceVerification:'direct',userView:false,trayOnPlay:true,voiceMicMode:'open',voiceHotkeys:{enabled:true,mute:'M',deafen:'N',pushToTalk:'V'} });
const report = progress => { if (win && !win.isDestroyed()) win.webContents.send('update:progress', progress); };
function publicState() {
  const admin = adminEnabled();
  const visible = admin ? content : {...content, changes:calendar.publicChanges(content.changes),events:content.events.map(event=>({...event,changes:calendar.publicChanges(event.changes)}))};
  const profiles = settings.profile?[{path:settings.profile,name:bridge.identity?.name||settings.accountName||'Carpeta de tu cuenta',avatar:settings.profileAvatars?.[settings.profile]||''}]:[];
  const {accountXuid,...publicSettings}=settings;
  return {admin,adminEligible:isAdminAccount(),userView:settings.userView===true,version:pkg.version,content:visible,settings:{...publicSettings,voiceVerification:verificationMode()},profiles,rpcMessage,contentSource,busy,voice:voice.snapshot(),account:{name:bridge.identity?.name||settings.accountName||'',connected:!!bridge.identity},...(admin?{github:githubStatus(),administrators:administrators.snapshot()}:{})};
}
function getEvent(id) {
  const event = content.events.find(event=>event.id === id);
  if (!event) throw new Error('El evento ya no existe.');
  return event;
}

async function loadContent() {
  content = core.validateContent(await core.readJson(path.join(app.getAppPath(), 'launcher-content.json')));
  let local = false;
  try { content = core.validateContent(await core.readJson(path.join(data, 'launcher-content.json'))); local = true; contentSource = 'Publicación local'; }
  catch (e) { if (e.code !== 'ENOENT') contentSource = 'Publicación local no válida; usando la incluida'; }
  if (!local) {
    try {
      content = core.validateContent(await core.fetchJson(REMOTE_CONTENT, 6000));
      contentSource = 'Publicación de GitHub';
      await core.atomicJson(path.join(data, 'content-cache.json'), content);
    } catch {
      try { content = core.validateContent(await core.readJson(path.join(data, 'content-cache.json'))); contentSource = 'Última publicación disponible'; } catch {}
    }
  }
}
async function discordStart() {
  if (rpc) { try { await rpc.destroy(); } catch {} rpc = null; }
  rpcMessage = !settings.discord ? 'Actividad desactivada' : !content.discordApplicationId ? 'Discord sin configurar' : 'Conectando con Discord…';
  if (!settings.discord || !content.discordApplicationId) return;
  const client = new Discord.Client({ transport: 'ipc' }); rpc = client;
  client.on('error', () => { rpcMessage = 'Abre Discord para mostrar tu actividad'; });
  client.on('disconnected', () => { rpcMessage = 'Discord desconectado'; });
  client.on('ready', async () => {
    if (rpc !== client) return;
    try {
      await client.setActivity({ details: (content.events.find(e=>e.enabled)?.name || 'Fonyx Launcher') + ' · Fonyx Studios', state: 'En el launcher', startTimestamp: started,
        buttons: [{ label: 'Comunidad Fonyx', url: SOCIALS.discord }], instance: false });
      rpcMessage = 'Actividad de Discord conectada';
    } catch { rpcMessage = 'No se pudo publicar la actividad'; }
  });
  client.login({ clientId: content.discordApplicationId }).catch(() => { rpcMessage = 'Abre Discord para mostrar tu actividad'; });
}
function guard(handler, requireAdmin = false) {
  return async (event, ...args) => {
    try {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origen no permitido.');
      if (requireAdmin && !adminEnabled()) throw new Error('Esta opción requiere la edición de administración.');
      return { ok: true, value: await handler(...args) };
    } catch (error) { return { ok: false, error: error.message || 'Ocurrió un error. Inténtalo de nuevo.' }; }
  };
}
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1240, height: 800, minWidth: 1000, minHeight: 680, frame: false, show: false, backgroundColor: '#11101a',
    title: adminEnabled() ? 'Fonyx Studios · Administración' : 'Fonyx Studios · Launcher', icon: path.join(app.getAppPath(), 'assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
  const entry = path.join(__dirname, 'renderer', 'index.html');
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler(async(wc,permission,callback,details)=>{
    if(wc!==win.webContents||permission!=='media'||!voiceArmed||!details.mediaTypes?.length||details.mediaTypes.some(type=>type!=='audio'))return callback(false);
    if(voiceGranted||settings.microphoneAllowed){voiceGranted=true;return callback(true);}
    try{const result=await dialog.showMessageBox(win,{type:'question',title:'Micrófono de Fonyx',message:'¿Permitir el micrófono para el chat de voz?',detail:'Se usará mientras estés conectado a la voz. Desconectar detiene la captura.',buttons:['Permitir','Cancelar'],defaultId:1,cancelId:1});voiceGranted=result.response===0;if(voiceGranted){settings.microphoneAllowed=true;await core.atomicJson(path.join(data,'settings.json'),settings);}callback(voiceGranted&&voiceArmed);}catch{callback(false);}
  });
  win.webContents.session.setPermissionCheckHandler((wc,permission,_origin,details)=>wc===win.webContents&&permission==='media'&&voiceArmed&&voiceGranted&&details.mediaType==='audio');
  win.once('ready-to-show', () => win.show());
  win.on('close', event => { if (busy) { event.preventDefault(); report({ phase: 'busy', message: 'Espera a que termine la actualización antes de cerrar.' }); } else if(!exitRequested){event.preventDefault();if(tray)win.hide();else win.minimize();} });
  for (const signal of ['focus','blur','show','hide']) win.on(signal, syncHotkeys);
  win.loadFile(entry);
}
function showWindow() { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function applyWindowTitle() { if (win && !win.isDestroyed()) win.setTitle(adminEnabled() ? 'Fonyx Studios · Administración' : 'Fonyx Studios · Launcher'); }
let keyReader=null,keyConfig='';
function voiceCommand(action,value) {
  if(!win||win.isDestroyed()||!voice.snapshot().connected)return;
  win.webContents.send('voice:command',action==='pushToTalk'?{action:'transmit',value:value===true}:{action});
}
function applyHotkeys(){return syncHotkeys();}
function syncHotkeys(){
  let keys=[];try{if(settings&&voice.snapshot().connected)keys=voiceBindings(settings.voiceHotkeys,settings.voiceMicMode);}catch{}
  const next=JSON.stringify(keys);
  if(next!==keyConfig||keyReader&&!keyReader.alive()){
    keyReader?.stop();keyReader=null;keyConfig=next;voiceCommand('pushToTalk',false);
    if(keys.length){const helper=app.isPackaged?path.join(process.resourcesPath,'native','FonyxVoiceKeys.exe'):path.join(app.getAppPath(),'native','FonyxVoiceKeys.exe');keyReader=startKeys(helper,keys,({action,pressed})=>{if(action==='pushToTalk')voiceCommand(action,pressed);else if(pressed)voiceCommand(action);});}
  }
  return Object.fromEntries(keys.map(key=>[key.action,true]));
}
function updateTray() {
  if (!tray) return;
  const snapshot = voice.snapshot(), connected = snapshot.connected;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Fonyx Launcher', click: showWindow },
    { type: 'separator' },
    { label: 'Silenciar micrófono', type: 'checkbox', checked: !!snapshot.muted, enabled: connected, click: () => voiceCommand('mute') },
    { label: 'Dejar de escuchar', type: 'checkbox', checked: !!snapshot.deafened, enabled: connected, click: () => voiceCommand('deafen') },
    { label: 'Abrir chat de voz', enabled: connected, click: () => { showWindow(); if (win && !win.isDestroyed()) win.webContents.send('navigate', 'voice'); } },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]));
  tray.setToolTip(connected ? (snapshot.verified?'Fonyx Launcher · Voz conectada':'Fonyx Launcher · Verifica tu voz en Minecraft') : 'Fonyx Launcher');
}
function createTray() {
  if (tray) return;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'assets/icon.ico')));
    tray.on('click', showWindow); tray.on('double-click', showWindow);
    updateTray();
  } catch { tray = null; }
}
function backgroundNotice() {
  if (Notification.isSupported()) new Notification({ title: 'Fonyx Studios', body: 'Fonyx sigue abierto para la voz y Discord. Ábrelo desde el icono oculto.' }).show();
}
function hideForPlay(){if(settings.trayOnPlay&&tray&&win&&!win.isDestroyed()){win.hide();backgroundNotice();}}
ipcMain.handle('state', guard(async () => publicState()));
ipcMain.handle('bank:status',guard(async()=>{
  const xuid=bridge.identity?.xuid,origin=content.events.find(event=>event.id==='jugosafio')?.bankEndpoint||'';
  const result=await bank.refresh(origin);
  return bridge.identity?.xuid===xuid?result:{record:null,status:'Conecta tu cuenta Microsoft'};
}));
ipcMain.handle('window', guard(async action => {
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
  else if (action === 'quit') app.quit();
}));
ipcMain.handle('social', guard(async key => { if (!SOCIALS[key]) throw new Error('Enlace no disponible.'); await shell.openExternal(SOCIALS[key]); }));
ipcMain.handle('admin:userView', guard(async value => {
  if (!isAdminAccount()) throw new Error('Esta opción requiere la edición de administración.');
  if (typeof value !== 'boolean') throw new Error('Ajuste inválido.');
  settings.userView = value;
  await core.atomicJson(path.join(data, 'settings.json'), settings);
  applyWindowTitle();
  return publicState();
}));
ipcMain.handle('hotkeys:apply', guard(async () => { updateTray(); return syncHotkeys(); }));
ipcMain.handle('admins:refresh',guard(async()=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  await administrators.refresh();applyWindowTitle();return publicState();
},true));
ipcMain.handle('admins:change',guard(async(name,grant)=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  const actor=bridge.identity.name;busy=true;
  try{await administrators.change({actor,name,grant,token:githubToken});}
  finally{busy=false;applyWindowTitle();}
  return publicState();
},true));
async function setupState(){return {...await setup.status(settings),complete:settings.setupComplete,audioConfigured:settings.audioConfigured,account:publicState().account,choices:bridge.identity?await setup.accountChoices(settings.root):[]};}
ipcMain.handle('setup:status',guard(setupState));
ipcMain.handle('setup:open-game',guard(async()=>{await setup.executableCheck(settings.minecraftExecutable);await shell.openExternal('minecraft://');return true;}));
ipcMain.handle('setup:refresh',guard(async()=>{
  settings.minecraftExecutable=await setup.detectExecutable(settings.minecraftExecutable);
  try{await setup.dataCheck(settings.root);}catch{settings.root=core.detectFolders().root;}
  if(bridge.identity&&!settings.profile)settings.profile=await setup.accountFolder(settings.root,bridge.identity.xuid);
  await core.atomicJson(path.join(data,'settings.json'),settings);
  return setupState();
}));
ipcMain.handle('setup:choose',guard(async kind=>{
  if(!['installation','root','account'].includes(kind)||busy)throw new Error('No se puede cambiar la carpeta en este momento.');
  const result=await dialog.showOpenDialog(win,{title:kind==='installation'?'Selecciona Minecraft.Windows.exe':kind==='account'?'Selecciona com.mojang de tu cuenta de Minecraft':'Selecciona los datos de Minecraft (com.mojang)',properties:[kind==='installation'?'openFile':'openDirectory'],...(kind==='installation'?{filters:[{name:'Minecraft',extensions:['exe']}]}:{defaultPath:settings.root})});
  if(!result.canceled){
    if(kind==='installation')settings.minecraftExecutable=await setup.executableCheck(result.filePaths[0]);
    else{const folder=await core.resolveMinecraftFolder(result.filePaths[0]);await setup.dataCheck(folder,kind==='account');if(kind==='account')settings.profile=folder;else{settings.root=folder;settings.profile=bridge.identity?await setup.accountFolder(folder,bridge.identity.xuid):'';}}
    settings.setupComplete=false;await core.atomicJson(path.join(data,'settings.json'),settings);
  }
  return setupState();
}));
ipcMain.handle('setup:select-data',guard(async folder=>{
  if(!bridge.identity)throw new Error('Conecta primero tu cuenta Microsoft.');
  const choices=await setup.accountChoices(settings.root);
  if(typeof folder!=='string'||!choices.includes(folder))throw new Error('Esta ubicación ya no está disponible. Vuelve a comprobar.');
  await setup.dataCheck(folder,true);settings.profile=folder;settings.setupComplete=false;await core.atomicJson(path.join(data,'settings.json'),settings);return setupState();
}));
ipcMain.handle('audio:prepare',guard(async()=>{voiceArmed=true;voiceGranted=!!settings.microphoneAllowed;return true;}));
ipcMain.handle('setup:audio',guard(async value=>{
  if(!voiceGranted)throw new Error('Prueba el micrófono y permite su uso antes de continuar.');
  Object.assign(settings,setup.audioPreferences(value));await core.atomicJson(path.join(data,'settings.json'),settings);return true;
}));
async function connectAccount(){
  try{await bridge.login();}catch(error){if(error.code==='ENOENT')throw new Error('Falta el motor de voz. Abre la distribución completa de Fonyx.');if(error.code==='VOICE_ENGINE_REQUEST_FAILED')throw new Error('Microsoft no pudo confirmar la sesión. Vuelve a conectar tu cuenta.');throw error;}
  let profile=await setup.accountFolder(settings.root,bridge.identity.xuid);
  if(!profile&&settings.accountXuid===bridge.identity.xuid)try{await setup.dataCheck(settings.profile,true);profile=settings.profile;}catch{}
  settings.accountName=bridge.identity.name;settings.accountXuid=bridge.identity.xuid;settings.profile=profile;
  applyWindowTitle();await core.atomicJson(path.join(data,'settings.json'),settings);return publicState();
}
ipcMain.handle('account:connect',guard(connectAccount));
ipcMain.handle('account:cancel',guard(async()=>{if(bridge.loginPromise)await bridge.close();return true;}));
ipcMain.handle('setup:finish',guard(async()=>{
  const check=await setup.status(settings);
  if(!check.rootValid||!check.profileValid||!check.installationValid)throw new Error(check.errors[0]||'Revisa las carpetas de Minecraft.');
  if(!bridge.identity||!settings.audioConfigured)throw new Error('Completa la cuenta Microsoft y el audio.');
  settings.setupComplete=true;await core.atomicJson(path.join(data,'settings.json'),settings);return publicState();
}));
ipcMain.handle('voice:prepare',guard(async eventId=>{
  const event=getEvent(eventId);if(!event.enabled||!event.server)throw new Error('Este evento todavía no está disponible.');
  if(!event.voiceEnabled)throw new Error('Este evento no tiene chat de voz activado.');
  if(!settings.setupComplete||!bridge.identity)throw new Error('Completa la configuración inicial y conecta tu cuenta Microsoft.');
  const folders=await setup.status(settings);if(!folders.rootValid||!folders.profileValid||!folders.installationValid){settings.setupComplete=false;await core.atomicJson(path.join(data,'settings.json'),settings);throw new Error('Faltan archivos de Minecraft. Abre la configuración para revisar sus carpetas.');}
  const reuse=bridge.identity&&bridge.matches(event.server,event.port);
  if(!reuse){await core.requireClosed();await core.rootCheck(settings.root);if(!settings.profile)throw new Error('Elige tu perfil de Minecraft en Ajustes antes de conectar la voz.');await core.rootCheck(settings.profile);}
  voiceArmed=true;voiceGranted=!!settings.microphoneAllowed;voiceEventId=event.id;
  try{return {name:bridge.identity.name};}catch(error){voiceArmed=false;if(error.code==='ENOENT')throw new Error('Falta el motor de conexión de voz. Usa la distribución completa de Fonyx.');throw error;}
}));
ipcMain.handle('voice:connect',guard(async options=>{
  if(!voiceArmed||!voiceGranted)throw new Error('Permite el micrófono antes de conectar.');
  if(!bridge.identity)throw new Error('Conecta tu cuenta Microsoft primero.');
  const config=validateVoiceOptions({...options,name:bridge.identity.name}),event=getEvent(voiceEventId);
  settings.voiceName=bridge.identity.name;settings.voiceRoom=config.room;settings.voiceRooms={...settings.voiceRooms,[event.id]:config.room};await core.atomicJson(path.join(data,'settings.json'),settings);
  if(!voiceArmed||!voiceGranted)throw new Error('La conexión de voz fue cancelada.');
  if(!event.voiceEnabled)throw new Error('Este evento no tiene chat de voz activado.');
  if(verificationMode()==='direct'){await voice.connectReady(config);try{await playEvent(event.id,true,{host:event.server,port:event.port});if(!voiceArmed||!voiceGranted)throw new Error('La conexión de voz fue cancelada.');return voice.snapshot();}catch(error){voice.disconnect();throw error;}}
  if(bridge.matches(event.server,event.port))return voice.connectReady(config);
  const destination=await bridge.start(event.server,event.port);
  try{await voice.connectReady(config);await playEvent(event.id,true,destination);if(!voiceArmed||!voiceGranted)throw new Error('La conexión de voz fue cancelada.');return voice.snapshot();}catch(error){voice.disconnect();await bridge.engine.request('stop_proxy').catch(()=>{});throw error;}
}));
ipcMain.handle('voice:disconnect',guard(async()=>{voice.disconnect();voiceArmed=false;voiceGranted=false;if(bridge.loginPromise)await bridge.close();else if(bridge.engine.child)await bridge.engine.request('stop_proxy');return voice.snapshot();}));
ipcMain.handle('voice:signal',guard(async(peer,payload)=>{voice.signal(peer,payload);return true;}));
ipcMain.handle('voice:controls',guard(async values=>{voice.controls(values);updateTray();return true;}));
ipcMain.handle('voice:level',guard(async value=>{if(!Number.isFinite(value))throw new Error('Nivel inválido.');voice.level(value);return true;}));
ipcMain.handle('voice:copy-code',guard(async()=>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(voiceCode))throw new Error('No hay un código de verificación vigente.');clipboard.writeText('/vcmc:verify \"'+voiceCode+'\"');return true;}));
ipcMain.handle('voice:mode',guard(async mode=>{if(!['direct','bridge'].includes(mode))throw new Error('Modo de verificación inválido.');if(voice.snapshot().connected)throw new Error('Desconecta la voz antes de cambiar de modo.');await core.requireClosed();settings.voiceVerification=mode;await core.atomicJson(path.join(data,'settings.json'),settings);return mode;},true));
ipcMain.handle('voice:microsoft',guard(async()=>{await shell.openExternal('https://www.microsoft.com/link');return true;}));
ipcMain.handle('voice:sign-out',guard(async()=>{await core.requireClosed();voice.disconnect();voiceArmed=false;voiceGranted=false;await bridge.signOut();settings.accountName='';settings.accountXuid='';settings.setupComplete=false;await core.atomicJson(path.join(data,'settings.json'),settings);return true;}));
const pingRequests = new Map();
ipcMain.handle('ping', guard(async id => {
  const event = getEvent(id || content.events[0].id);
  if (!event.enabled || !event.server) return {online:null,message:'Evento no disponible'};
  const key = `${event.server}:${event.port}`;
  if (!pingRequests.has(key)) pingRequests.set(key,pingBedrockServer(event.server,event.port,4500,platformFetch).finally(()=>pingRequests.delete(key)));
  const result = await pingRequests.get(key);
  if (!adminEnabled()) { const {motd,...info}=result; return info; }
  return result;
}));
ipcMain.handle('settings:save', guard(async value => {
  if (busy) throw new Error('Espera a que termine la actualización.');
  if (!value || typeof value.profile !== 'string' || value.profile.length > 2048) throw new Error('Selecciona un perfil de Minecraft.');
  for (const key of ['discord', 'reducedMotion', 'trustEvents', 'vanillaMenu']) if (typeof value[key] !== 'boolean') throw new Error('Ajustes inválidos.');
  const root = await core.resolveMinecraftFolder(value.root === undefined ? settings.root : value.root);
  const loadingStyle = value.loadingStyle === undefined ? (settings.loadingStyle || 'diamond') : value.loadingStyle;
  if (!['diamond','roulette'].includes(loadingStyle)) throw new Error('Animación de carga inválida.');
  if (value.profile) await core.rootCheck(value.profile);
  if (value.profileName !== undefined && (typeof value.profileName !== 'string' || value.profileName.length > 40)) throw new Error('El nombre del perfil admite hasta 40 caracteres.');
  if (value.trayOnPlay !== undefined && typeof value.trayOnPlay !== 'boolean') throw new Error('Ajustes inválidos.');
  if (value.voiceMicMode !== undefined && !['open','pushToTalk'].includes(value.voiceMicMode)) throw new Error('Modo de micrófono inválido.');
  let hotkeys = settings.voiceHotkeys || { enabled: true, mute: 'M', deafen: 'N', pushToTalk: 'V' };
  if (value.voiceHotkeys !== undefined) {
    const candidate = value.voiceHotkeys;
    if (!candidate || typeof candidate !== 'object' || typeof candidate.enabled !== 'boolean' || !['mute','deafen','pushToTalk'].every(key => typeof candidate[key] === 'string' && /^[A-Za-z0-9+ ]{1,20}$/.test(candidate[key].trim()))) throw new Error('Teclas de voz inválidas.');
    hotkeys = { enabled: candidate.enabled, mute: candidate.mute.trim(), deafen: candidate.deafen.trim(), pushToTalk: candidate.pushToTalk.trim() };
  }
  voiceBindings({...hotkeys,enabled:true},'pushToTalk');
  const aliases = {...settings.profileAliases};
  if (value.profile && value.profileName !== undefined) { if (value.profileName.trim()) aliases[value.profile] = value.profileName.trim(); else delete aliases[value.profile]; }
  if (!value.trustEvents && trustSession) { await trustSession.stop(); trustSession = null; }
  const profiles=core.detectFolders(root).profiles;
  const profile=root===settings.root || profiles.some(p=>p.path===value.profile) ? value.profile : profiles.length===1 ? profiles[0].path : '';
  settings = { ...settings, root, loadingStyle, profile, discord: value.discord, reducedMotion: value.reducedMotion, trustEvents: value.trustEvents, vanillaMenu: value.vanillaMenu, profileAliases: aliases, trayOnPlay: value.trayOnPlay === undefined ? settings.trayOnPlay : value.trayOnPlay, voiceMicMode: value.voiceMicMode === undefined ? settings.voiceMicMode : value.voiceMicMode, voiceHotkeys: hotkeys };
  await core.atomicJson(path.join(data, 'settings.json'), settings); await discordStart(); return publicState();
}));
ipcMain.handle('settings:avatar', guard(async (profile, skin = false) => {
  if (typeof skin !== 'boolean') throw new Error('Tipo de imagen inválido.');
  if (!core.detectFolders(settings.root).profiles.some(p=>p.path===profile)) throw new Error('Selecciona un perfil detectado.');
  const result = await dialog.showOpenDialog(win,{title:'Elegir avatar o skin PNG',properties:['openFile'],filters:[{name:'Imagen PNG',extensions:['png']}]});
  if (result.canceled) return publicState();
  const file=result.filePaths[0], stat=await fs.promises.stat(file);
  if (stat.size > 2097152) throw new Error('La imagen debe pesar menos de 2 MB.');
  let image=nativeImage.createFromBuffer(await fs.promises.readFile(file)); const size=image.getSize();
  if (image.isEmpty() || size.width>2048 || size.height>2048) throw new Error('La imagen PNG no es válida.');
  let skinFace=false;
  if (skin && !((size.width===64 || size.width===128) && (size.height===size.width || size.height===size.width/2))) throw new Error('La skin debe ser PNG de 64×32, 64×64, 128×64 o 128×128.');
  if (skin && (size.width===64 || size.width===128) && (size.height===size.width || size.height===size.width/2)) { const unit=size.width/64; image=image.crop({x:8*unit,y:8*unit,width:8*unit,height:8*unit}); skinFace=true; }
  const avatars={...settings.profileAvatars,[profile]:(skinFace?image:image.resize({width:64,height:64,quality:'good'})).toDataURL()};
  settings={...settings,profileAvatars:avatars};await core.atomicJson(path.join(data,'settings.json'),settings);return publicState();
}));
ipcMain.handle('settings:folder', guard(async () => {
  if (busy) throw new Error('Espera a que termine la actualización.');
  const result = await dialog.showOpenDialog(win, { title: 'Selecciona la carpeta compartida com.mojang', properties: ['openDirectory'], defaultPath: settings.root });
  if (!result.canceled) { settings.root = await core.resolveMinecraftFolder(result.filePaths[0]); const profiles=core.detectFolders(settings.root).profiles; if (!profiles.some(p=>p.path===settings.profile)) settings.profile=profiles.length===1?profiles[0].path:''; await core.atomicJson(path.join(data, 'settings.json'), settings); }
  return publicState();
}));
async function playEvent(eventId, open = true, destination = null) {
  if (typeof open !== 'boolean') throw new Error('Acción no válida.');
  const event = getEvent(eventId);
  if (!event.enabled || !event.server) throw new Error('Este evento todavía no está disponible.');
  if(open&&event.voiceEnabled&&!destination)throw new Error('Este evento necesita voz. Entra con el botón Jugar del launcher.');
  if (busy) throw new Error('Ya hay una actualización en curso.');
  await core.rootCheck(settings.root); await core.requireClosed();
  if (open && !settings.profile) throw new Error('Elige tu perfil de Minecraft en Ajustes para guardar el servidor del evento en tu cuenta.');
  if (open) await core.rootCheck(settings.profile);
  busy = true;
  try {
    report({ phase: 'check', message: 'Buscando novedades del evento…' });
    const feed = event.manifestUrl ? core.validateFeed(await core.fetchJson(event.manifestUrl)) : null;
    const count = feed ? await core.updatePacks(settings.root,feed,report) : 0;
    await core.requireClosed();
    if (open) {
      try { await core.removeLegacyGlobalPack(settings.profile); }
      catch { report({phase:'check',message:'No se pudo retirar una referencia antigua de recursos globales. La conexión continuará.'}); }
    }
    let trustWarning = '';
    if (open) {
      const server=destination?.host||event.server,port=destination?.port||event.port;
      await core.registerServer(settings.profile, server, port, event.name);
      if (trustSession) { await trustSession.stop(); trustSession = null; }
      if(event.voiceEnabled&&(!voiceArmed||!voiceGranted||!voice.snapshot().connected))throw new Error('Se perdió la conexión de voz. Vuelve a pulsar Jugar.');
      const helper=path.join(app.isPackaged?process.resourcesPath:app.getAppPath(),'native','FonyxEventTrust.exe');
      const connection=await launchWithEventTrust({helper,directory:path.join(data,'event-trust-backups'),host:server,port,uri:core.connectUri(server,port),enabled:settings.trustEvents,open:uri=>shell.openExternal(uri),report:message=>report({phase:'launch',message})});
      trustSession=connection.session;trustWarning=connection.warning;
      if (rpc) rpc.setActivity({ details: event.name + ' · Fonyx Studios', state: 'Conexión solicitada al evento', startTimestamp: started, instance: false }).catch(() => {});
    }
    report({ phase: 'done', opened: open, message: open ? '¡Todo listo! Minecraft recibió la conexión. Mantén Fonyx abierto para Discord.' + trustWarning : 'Los recursos del evento están actualizados. Ya puedes cerrar esta ventana.' });
    voiceAwaitBackground=open&&event.voiceEnabled;
    if(voiceAwaitBackground&&voice.snapshot().verified){voiceAwaitBackground=false;hideForPlay();}
    if (open && !event.voiceEnabled) hideForPlay();
    return { count };
  } finally { busy = false; }
}
ipcMain.handle('play', guard((eventId,open=true)=>{
  const event=getEvent(eventId);
  if(open&&event.voiceEnabled&&voiceArmed&&voiceGranted&&bridge.identity&&voiceEventId===eventId&&voice.snapshot().connected){
    const destination=verificationMode()==='bridge'?bridge.destination:{host:event.server,port:event.port};
    if(!destination)throw new Error('Vuelve a conectar la voz desde Jugar.');
    return playEvent(eventId,open,destination);
  }
  return playEvent(eventId,open);
}));
ipcMain.handle('admin:save', guard(async value => {
  if (busy) throw new Error('Espera a que termine la actualización.');
  content = core.validateContent(value); await core.atomicJson(path.join(data, 'launcher-content.json'), content);
  contentSource = 'Publicación local'; await discordStart(); return publicState();
}, true));
ipcMain.handle('admin:export', guard(async () => {
  const result = await dialog.showSaveDialog(win, { title: 'Exportar publicación para GitHub Releases', defaultPath: path.join(app.getPath('downloads'), 'launcher-content.json'), filters: [{ name: 'Publicación de Fonyx', extensions: ['json'] }] });
  if (!result.canceled) await core.atomicJson(result.filePath, core.validateContent(content));
  return !result.canceled;
}, true));
ipcMain.handle('admin:refresh', guard(async () => {
  if (busy) throw new Error('Espera a que termine la actualización.');
  const before=githubToken?await publishing.snapshot(githubToken):null;
  const remote = core.validateContent(await core.fetchJson(REMOTE_CONTENT+'?fonyx='+Date.now()));
  if(githubToken){const after=await publishing.snapshot(githubToken);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('La publicación cambió durante la descarga. Carga desde GitHub otra vez.');githubBase=after;}
  await core.atomicJson(path.join(data, 'launcher-content.json'), remote); content = remote; contentSource = 'Publicación de GitHub'; await discordStart(); return publicState();
}, true));
ipcMain.handle('github:connect',guard(async (token,remember=false)=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  if(typeof remember!=='boolean')throw new Error('Ajuste inválido.');
  const account=await publishing.authorize(token);
  if(remember&&!safeStorage.isEncryptionAvailable())throw new Error('Windows no permite cifrar la autorización. Conecta sin recordarla.');
  if(remember)await fs.promises.writeFile(path.join(data,'github-auth.bin'),safeStorage.encryptString(token),{mode:0o600});
  else await fs.promises.rm(path.join(data,'github-auth.bin'),{force:true});
  githubToken=token;githubLogin=account.login;githubBase=null;return githubStatus();
},true));
ipcMain.handle('github:disconnect',guard(async()=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  githubToken='';githubLogin='';githubBase=null;
  await fs.promises.rm(path.join(data,'github-auth.bin'),{force:true});return githubStatus();
},true));
ipcMain.handle('github:token-help',guard(async()=>{await shell.openExternal('https://github.com/settings/personal-access-tokens/new');},true));
  function pendingPacks(){return publishing.packPlan(remotePacks,addonPacks,{replaceAll:addonReplace,removeIds:removedPackIds});}
async function clearAddon(){
  if(addonStage){const old=path.resolve(addonStage);if(!old.startsWith(path.resolve(app.getPath('temp'))+path.sep+'fonyx-publish-'))throw new Error('Carpeta temporal no válida.');addonStage='';await fs.promises.rm(old,{recursive:true,force:true});}addonPacks=[];packEventId='';addonReplace=false;remotePacks=[];removedPackIds=[];
}
ipcMain.handle('github:packs',guard(async eventId=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  const event=getEvent(eventId);busy=true;
  try{const feed=event.manifestUrl?core.validateFeed(await core.fetchJson(event.manifestUrl)):{packs:[]};await clearAddon();packEventId=event.id;remotePacks=feed.packs.map(({file,...pack})=>pack);return githubStatus();}finally{busy=false;}
},true));
ipcMain.handle('github:remove-pack',guard(async(eventId,uuid)=>{
  if(busy||packEventId!==eventId||typeof uuid!=='string'||!pendingPacks().some(p=>p.uuid.toLowerCase()===uuid.toLowerCase()))throw new Error('Carga primero los packs de este evento.');
  uuid=uuid.toLowerCase();addonPacks=addonPacks.filter(p=>p.uuid.toLowerCase()!==uuid);if(!removedPackIds.includes(uuid))removedPackIds.push(uuid);return githubStatus();
},true));
ipcMain.handle('github:export-packs',guard(async eventId=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  const event=getEvent(eventId),result=await dialog.showSaveDialog(win,{title:'Guardar todos los packs',defaultPath:path.join(app.getPath('downloads'),'packs.zip'),filters:[{name:'Packs de Aternos',extensions:['zip']}]});
  if(result.canceled)return false;
  busy=true;const stage=await fs.promises.mkdtemp(path.join(app.getPath('temp'),'fonyx-export-'));
  try{
    const feed=packEventId===eventId?{schema:1,packs:pendingPacks()}:core.validateFeed(await core.fetchJson(event.manifestUrl));
    if(packEventId!==eventId)feed.packs=feed.packs.map(({file,...pack})=>pack);
    const archive=path.join(stage,'packs.zip');await publishing.exportPacks(feed,archive,stage);const pending=result.filePath+'.pending-'+crypto.randomBytes(8).toString('hex');try{await fs.promises.copyFile(archive,pending);await fs.promises.rename(pending,result.filePath);}finally{await fs.promises.rm(pending,{force:true}).catch(()=>{});}return true;
  }finally{busy=false;await fs.promises.rm(stage,{recursive:true,force:true}).catch(()=>{});}
},true));
ipcMain.handle('github:addon',guard(async(eventId,replaceAll=false)=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
  getEvent(eventId);if(typeof replaceAll!=='boolean')throw new Error('Selección inválida.');
  if(packEventId&&packEventId!==eventId)throw new Error('Carga los packs del evento seleccionado antes de añadir archivos.');
    const result=await dialog.showOpenDialog(win,{title:replaceAll?'Seleccionar conjunto completo de addons':'Añadir o actualizar addons',properties:['openFile','multiSelections'],filters:[{name:'Addons de Minecraft',extensions:['mcaddon','mcpack','zip']}]});
  if(result.canceled)return githubStatus();busy=true;
  try{
    if(!addonStage)addonStage=await fs.promises.mkdtemp(path.join(app.getPath('temp'),'fonyx-publish-'));
      const batch=await fs.promises.mkdtemp(path.join(addonStage,'batch-'));
      let prepared,loaded=remotePacks;
      try{
        win.webContents.send('github:progress','Detectando packs, versiones y dependencias…');
        prepared=await publishing.prepareAddons(result.filePaths,batch);
        if(!replaceAll&&packEventId!==eventId){const event=getEvent(eventId);loaded=event.manifestUrl?core.validateFeed(await core.fetchJson(event.manifestUrl)).packs.map(({file,...p})=>p):[];}
      }catch(error){await fs.promises.rm(batch,{recursive:true,force:true}).catch(()=>{});throw error;}
    const next=replaceAll?[]:addonPacks.filter(p=>!prepared.some(n=>n.uuid===p.uuid));next.push(...prepared);
    if(next.reduce((sum,p)=>sum+p.bytes,0)>512*1024*1024)throw new Error('La selección supera 512 MB.');
      addonPacks=next;remotePacks=loaded;packEventId=eventId;if(replaceAll){addonReplace=true;removedPackIds=[];}
    return githubStatus();
  }finally{busy=false;}
},true));
ipcMain.handle('github:clear-addon',guard(async()=>{if(busy)throw new Error('Espera a que termine la operación actual.');await clearAddon();return githubStatus();},true));
  ipcMain.handle('github:publish',guard(async (eventId,includePacks=true)=>{
  if(busy)throw new Error('Espera a que termine la operación actual.');
    if(typeof includePacks!=='boolean')throw new Error('Modo de publicación inválido.');
  if(!githubToken)throw new Error('Conecta GitHub en Administración.');
  if(!githubBase)throw new Error('Carga desde GitHub antes de editar y publicar en este equipo.');
    getEvent(eventId);if(includePacks&&packEventId&&packEventId!==eventId)throw new Error('Los cambios de packs pertenecen a otro evento.');busy=true;
  try{
      const result=await publishing.publish({token:githubToken,content,eventId,packs:includePacks?addonPacks:[],replaceAll:includePacks&&addonReplace,removeIds:includePacks?removedPackIds:[],base:githubBase,report:message=>win.webContents.send('github:progress',message)});
    content=result.content;contentSource='Publicación de GitHub';githubBase=result.base;
      await core.atomicJson(path.join(data,'content-cache.json'),content);
      await fs.promises.rm(path.join(data,'launcher-content.json'),{force:true});
      if(includePacks)await clearAddon();
    return {state:publicState(),url:result.url};
  }finally{busy=false;}
},true));
if (!app.requestSingleInstanceLock({ admin: adminEnabled() })) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    await fs.promises.mkdir(data, { recursive: true });
    voice.deviceToken=crypto.randomBytes(16).toString('hex');
    if(safeStorage.isEncryptionAvailable()){
      try{const saved=safeStorage.decryptString(await fs.promises.readFile(path.join(data,'voice-device.bin')));if(/^[a-f0-9]{32}$/.test(saved))voice.deviceToken=saved;}catch{}
      try{await fs.promises.writeFile(path.join(data,'voice-device.bin'),safeStorage.encryptString(voice.deviceToken),{mode:0o600});}catch{}
    }
    if(safeStorage.isEncryptionAvailable())try{githubToken=safeStorage.decryptString(await fs.promises.readFile(path.join(data,'github-auth.bin')));githubLogin=(await publishing.authorize(githubToken)).login;}catch{githubToken='';}
    settings = defaults();
    try { const saved = await core.readJson(path.join(data, 'settings.json')); for (const key of ['root','profile','loadingStyle','discord','reducedMotion','trustEvents','vanillaMenu','profileAliases','profileAvatars','minecraftExecutable','voiceInput','voiceOutput','audioConfigured','microphoneAllowed','setupComplete','accountName','accountXuid','voiceRooms','voiceVerification']) if (typeof saved[key] === typeof settings[key]) settings[key] = saved[key]; for(const key of ['voiceName','voiceRoom'])if(typeof saved[key]==='string'&&saved[key].length<=120)settings[key]=saved[key]; if(typeof saved.userView==='boolean')settings.userView=saved.userView; if(typeof saved.trayOnPlay==='boolean')settings.trayOnPlay=saved.trayOnPlay; if(['open','pushToTalk'].includes(saved.voiceMicMode))settings.voiceMicMode=saved.voiceMicMode; if(saved.voiceHotkeys&&typeof saved.voiceHotkeys==='object'){const h=saved.voiceHotkeys;settings.voiceHotkeys={enabled:h.enabled!==false,mute:typeof h.mute==='string'?h.mute:settings.voiceHotkeys.mute,deafen:typeof h.deafen==='string'?h.deafen:settings.voiceHotkeys.deafen,pushToTalk:typeof h.pushToTalk==='string'?h.pushToTalk:settings.voiceHotkeys.pushToTalk};} } catch {}
    try { await core.rootCheck(settings.root); } catch { settings.root=core.detectFolders().root; }
    settings.minecraftExecutable=await setup.detectExecutable(settings.minecraftExecutable);
    await Promise.all([loadContent(),administrators.load()]); createWindow(); createTray(); discordStart(); syncHotkeys();
    setInterval(()=>{if(!isAdminAccount() && !busy && contentSource !== 'Publicación local') loadContent().catch(()=>{});},120000).unref();
    setInterval(async()=>{
      if(busy)return;
      const previous=JSON.stringify(administrators.snapshot());await administrators.refresh();
      if(previous!==JSON.stringify(administrators.snapshot())){
        applyWindowTitle();if(win&&!win.isDestroyed())win.webContents.send('admin:changed');
      }
    },120000).unref();
  }).catch(error => { dialog.showErrorBox('Fonyx Studios', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if(busy){event.preventDefault();report({phase:'busy',message:'Espera a que termine la actualización antes de salir.'});return;}
  exitRequested=true;
  keyReader?.stop();keyReader=null;
  if (tray) { tray.destroy(); tray = null; }
  voice.disconnect();voiceArmed=false;voiceGranted=false;
  if(addonStage&&!busy)clearAddon().catch(()=>{});
  if (!quitting && (trustSession||bridge.engine.child)) {
    event.preventDefault(); const session = trustSession; trustSession = null;
    Promise.all([bridge.close(),session?.stop()]).catch(error => dialog.showErrorBox('Cierre de la conexión', error.message)).finally(() => { quitting = true; app.quit(); });
    return;
  }
  if (rpc) rpc.destroy().catch(() => {});
});
