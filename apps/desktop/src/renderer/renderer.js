const api = window.fonyx, calendar = window.fonyxCalendar;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let state, selectedEvent='jugosafio', page='home', selectedDate='2026-12-01', updating=false, playingRevil=false, toastTimer;
let adminDraft=null, editId='', editDate='2026-12-01', lastContent='';
let administratorsChanging=false,administratorsMessage='';
let adminDirty=false,savingAdmin=false,lastPlayOpen=true,pingSequence=0;
const settingsKeys=['discord','trustEvents','vanillaMenu','reducedMotion'];
const artPresets={
  'assets/jugosafio.png':'Jugosafio R', 'assets/experimento-bedrock.png':'Experimento Bedrock',
  'assets/fonyx-classic.png':'Fonyx Studios', 'assets/fonyx-symbol.png':'Fonyx · símbolo',
  'assets/fonyx-jugosafio-animated.webp':'Fonyx · ruleta animada', 'assets/fonyx-event.png':'Fonyx · ruleta fija',
  'assets/fonyx-color.png':'Fonyx · color', 'assets/map.png':'Mapa de Jugosafio', 'assets/notices.png':'Tablón'
};
const event = () => state.content.events.find(e=>e.id===selectedEvent) || state.content.events[0];
const editing = () => adminDraft.events.find(e=>e.id===editId);
const voiceRoom=id=>state.settings.voiceRooms?.[id]??(id==='jugosafio'?state.settings.voiceRoom||'':'');
const svg = name => {const node=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);node.append(use);return node;};
function accentInk(hex) {
  const [r,g,b]=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b>.179?'#000000':'#ffffff';
}
function imageURL(value) {return typeof value==='string' && value.startsWith('assets/') ? '../../'+value : /^https:\/\//.test(value || '') ? value : '../../assets/fonyx-symbol.png';}
function setImage(img,value) {const source=imageURL(value); if(img.getAttribute('src')!==source) img.src=source;}
async function call(promise) {const result=await promise;if(!result.ok) throw new Error(result.error);return result.value;}
function toast(text) {clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,6500);}
function stopRevil() {playingRevil=false;$('#revil-gif').hidden=true;$('#revil-gif').removeAttribute('src');$('#revil-cover').hidden=false;$('#revil-play').textContent='Reproducir secuencia';}
function navigate(next) {
  if(!['home','notices','bestiary','changes','voice','admin'].includes(next) || (next==='admin'&&!state.admin)) return;
  stopRevil();page=next;document.body.dataset.page=next;
  $$('.page').forEach(p=>{p.hidden=p.id!=='page-'+next;});
  $$('.rail-button[data-page]').forEach(b=>{const active=b.dataset.page===next;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  $$('.event-rail').forEach(b=>{const active=next==='home'&&b.dataset.event===selectedEvent;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  const titles={home:event().name,notices:'Avisos de '+event().name,bestiary:'Dedciclopedia',changes:'Cambios de '+event().name,voice:'Chat de voz',admin:'Administración'};
  $('#page-title').textContent=titles[next];$('main').scrollTo({top:0,behavior:'instant'});
  if(next==='voice')window.fonyxVoice.show({eventId:event().id,eventName:event().name,name:state.settings.voiceName||state.profiles.find(p=>p.path===state.settings.profile)?.name||'',room:voiceRoom(event().id)});if(next==='notices') renderNotices();if(next==='changes') renderCalendar();if(next==='admin') fillAdmin();
  if(next==='bestiary') {$('#bestiary-content').hidden=event().id!=='jugosafio';$('#bestiary-empty').hidden=event().id==='jugosafio';}
}
function selectEvent(id) {if(updating) return;if(selectedEvent!==id)window.fonyxVoice.leave();selectedEvent=id;renderEvent();navigate('home');ping();}
function renderNavigation() {
  const nav=$('#event-navigation');nav.replaceChildren();
  for(const e of state.content.events) {
    const button=document.createElement('button');button.className='rail-button event-rail';button.dataset.event=e.id;button.title=e.name+(e.enabled?'':' · Próximamente');button.setAttribute('aria-label',button.title);
    const img=document.createElement('img');setImage(img,e.logo);img.alt='';const label=document.createElement('span');label.textContent=e.name;button.append(img,label);button.addEventListener('click',()=>selectEvent(e.id));nav.append(button);
  }
}
function renderProfile() {
  const name=state.account?.name || 'Conectar Microsoft';
  $('#profile-name').textContent=name;const avatar=state.settings.profileAvatars?.[state.settings.profile] || '';
  $('#profile-avatar').hidden=!avatar;$('#profile-initial').hidden=!!avatar;
  if(avatar) $('#profile-avatar').src=avatar;$('#profile-initial').textContent=name.slice(0,1).toUpperCase();
}
function renderEvent() {
  const e=event();selectedEvent=e.id;document.body.dataset.event=e.id;
  document.body.classList.toggle('vanilla-menu',state.settings.vanillaMenu);
  document.body.classList.toggle('reduced-motion',state.settings.reducedMotion);
  document.body.style.setProperty('--accent',e.accent);document.body.style.setProperty('--accent-ink',accentInk(e.accent));
  const still=state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  setImage($('#studio-logo'),still&&e.studioLogo==='assets/fonyx-jugosafio-animated.webp'?'assets/fonyx-event.png':e.studioLogo);
  setImage($('.event-logo'),e.logo);$('.event-logo').alt=e.name;setImage($('#update-logo'),e.logo);
  $('.hero-map').style.backgroundImage=`url(${JSON.stringify(imageURL(e.background))})`;
  $('#hero-headline').textContent=e.headline;$('#hero-headline').hidden=!e.headline.trim();
  $('#hero-message').textContent=e.message;$('#hero-message').hidden=!e.message.trim();
  $('#play-button').disabled=!e.enabled||updating;$('#play-button span').textContent=e.enabled?'Jugar':'Próximamente';$('#refresh-server').disabled=!e.enabled;
  const tab=$('.rail-button[data-page=notices]'),label='Avisos de '+e.name;tab.title=label;tab.setAttribute('aria-label',label);tab.querySelector('span').textContent=label;
  if(!e.enabled){$('#server-state').textContent='Próximamente';$('#server-details').textContent='Servidor aún no anunciado';$('#status-dot').dataset.status='unknown';}
  else {$('#server-state').textContent='Consultando…';$('#server-details').textContent=e.server+':'+e.port;$('#status-dot').dataset.status='unknown';}
  renderProfile();
}
function render() {
  if(page==='admin'&&!state.admin)page='home';
  document.title=state.admin?'Fonyx Studios · Administración':'Fonyx Studios · Launcher';
  $$('.admin-only').forEach(e=>e.hidden=!state.admin || (e.id==='page-admin'&&page!=='admin'));
  $$('.admin-eligible-only').forEach(e=>e.hidden=!state.adminEligible);
  $('#edition-label').textContent=state.admin?' · Admin':'';
  if(!state.content.events.some(e=>e.id===selectedEvent)) selectedEvent=state.content.events[0].id;
  renderNavigation();renderEvent();navigate(page);renderGithub();
}
function renderNotices() {
  const e=event();$('#notices-heading').textContent='Avisos de '+e.name;const list=$('#notice-list');list.replaceChildren();
  for(const n of e.notices) {const article=document.createElement('article');article.className='notice';const tag=document.createElement('span');tag.className='notice-tag';tag.textContent=n.tag;const title=document.createElement('h3');title.textContent=n.title;const text=document.createElement('p');text.textContent=n.text;article.append(tag,title,text);list.append(article);}
  if(!e.notices.length) {const empty=document.createElement('p');empty.className='empty-state';empty.textContent='No hay avisos publicados.';list.append(empty);}
}
async function ping() {
  if(!state || !event().enabled) return;const id=event().id,request=++pingSequence;$('#refresh-server').disabled=true;
  try {
    const info=await call(api.ping(id));if(event().id!==id||request!==pingSequence) return;
    $('#status-dot').dataset.status=info.online===true?'online':info.online===false?'offline':'unknown';
    $('#server-state').textContent=info.online===true?'En línea':info.online===false?'Apagado en Aternos':'Estado sin confirmar';
    $('#server-details').textContent=info.online===true?`${info.players} / ${info.max} jugadores · ${info.ping} ms` : info.online===false?'Puedes intentar conectar cuando termine de iniciar.':'Puedes intentar conectar.';
    if(state.admin) $('#admin-diagnostics').textContent=`${event().server}:${event().port} · ${info.protocol || info.message} · ${state.contentSource}`;
  } catch {if(event().id===id&&request===pingSequence){$('#server-state').textContent='Estado sin confirmar';$('#server-details').textContent='Puedes intentar conectar.';$('#status-dot').dataset.status='unknown';}}
  finally {if(event().id===id&&request===pingSequence) $('#refresh-server').disabled=false;}
}
function profileFields() {
  const profile=state.profiles.find(p=>p.path===$('#profile-select').value);
  $('#settings-form').elements.profileName.value=state.settings.profileAliases?.[$('#profile-select').value] || '';
  $('#profile-info').textContent=profile?`${profile.worlds} mundos locales. Puedes asignarle un nombre para reconocerlo.`:'Selecciona un perfil de Minecraft.';
}
async function openSettings() {
  try {state=await call(api.state());const select=$('#profile-select');select.replaceChildren(new Option('Elegir perfil',''));state.profiles.forEach(p=>select.add(new Option(p.name,p.path)));if(state.settings.profile&&!state.profiles.some(p=>p.path===state.settings.profile))select.add(new Option('Perfil guardado',state.settings.profile));select.value=state.settings.profile;profileFields();const form=$('#settings-form').elements;for(const key of settingsKeys)form[key].checked=state.settings[key];form.loadingStyle.value=state.settings.loadingStyle||'diamond';form.trayOnPlay.checked=state.settings.trayOnPlay!==false;form.voiceMicMode.value=state.settings.voiceMicMode||'open';const hotkeys=state.settings.voiceHotkeys||{};form.voiceHotkeysEnabled.checked=hotkeys.enabled!==false;form.voiceHotkeyMute.value=hotkeys.mute||'M';form.voiceHotkeyDeafen.value=hotkeys.deafen||'N';form.voiceHotkeyPushToTalk.value=hotkeys.pushToTalk||'V';form.userView.checked=state.settings.userView===true;$('#minecraft-folder').value=state.settings.root||'';$('#discord-state').textContent=state.rpcMessage;$('#settings-dialog').showModal();} catch(error){toast(error.message);}
}
function progress(info) {
  $('#progress-message').textContent=info.message;const bar=$('#update-progress');
  if(info.phase==='download'&&info.total){bar.value=Math.min(95,((info.index-1+info.bytes/info.total)/info.count)*90);$('#progress-detail').textContent=`${(info.bytes/1048576).toFixed(1)} / ${(info.total/1048576).toFixed(1)} MB`;$('#progress-percent').textContent=Math.round(bar.value)+' %';}
  else if(info.phase==='done'){bar.value=100;$('#progress-percent').textContent='100 %';$('#progress-detail').textContent=info.opened?'Conexión solicitada':'Recursos actualizados';$('#update-title').textContent=info.opened?'Conexión solicitada':'Recursos actualizados';}
  else {bar.removeAttribute('value');$('#progress-percent').textContent='';$('#progress-detail').textContent=info.index?`Pack ${info.index} de ${info.count}`:'';}
}
function launchErrorMessage(error) {
  const message=error?.message||'No se pudo completar la operación.';
  if(/ENOENT/i.test(message))return 'Falta un archivo necesario. Revisa la ubicación de Minecraft o vuelve a descargar los packs.';
  if(/ENOTFOUND|EAI_AGAIN/i.test(message))return 'No se pudo encontrar el servidor de descarga. Revisa la conexión y vuelve a intentarlo.';
  if(/ECONNRESET|ETIMEDOUT/i.test(message))return 'La conexión se interrumpió. Puedes volver a intentar la descarga.';
  return message;
}
async function play(open=true) {
  if(updating||!event().enabled)return;
  updating=true;lastPlayOpen=open;$('#play-button').disabled=true;$('#update-only').disabled=true;
  try {
    const folders=await call(api.setupStatus());
    const needsSetup=open?(!state.settings.setupComplete||!state.account?.connected||!folders.rootValid||!folders.profileValid||!folders.installationValid):!folders.rootValid;
    if(needsSetup){await configureLauncher();return;}
    const id=event().id;$('#close-progress').hidden=true;$('#retry-progress').hidden=true;$('#progress-error-details').hidden=true;
    $('#update-title').textContent='Revisando recursos';progress({message:'Comprobando packs.'});
    if(!$('#update-dialog').open)$('#update-dialog').showModal();
    window.fonyxLoading.start(state.settings.loadingStyle||'diamond',state.settings.reducedMotion);
    if(open&&event().voiceEnabled){window.fonyxVoice.configure(state.settings);await window.fonyxVoice.play({eventId:id,eventName:event().name,room:voiceRoom(id)});navigate('voice');$('#update-dialog').close();}
    else{if(open)await window.fonyxVoice.leave();await call(open?api.play(id):api.update(id));}
  }catch(error){
    if($('#update-dialog').open){
      $('#update-title').textContent='No se pudo continuar';$('#progress-message').textContent=launchErrorMessage(error);
      $('#update-progress').value=0;$('#progress-detail').textContent='';$('#progress-percent').textContent='';
      $('#progress-error-text').textContent=error.message;$('#progress-error-details').hidden=launchErrorMessage(error)===error.message;
      $('#progress-error-details').open=false;$('#retry-progress').hidden=false;
    }else toast(launchErrorMessage(error));
  }finally{
    window.fonyxLoading.stop();updating=false;$('#play-button').disabled=!event().enabled;$('#update-only').disabled=false;$('#close-progress').hidden=false;
    syncAdminWorkspace();
  }
}
function filteredEntries(date) {const category=$('#category-filter').value;return (event().changes[date]||[]).filter(entry=>calendar.visible(entry)&&(!category||(typeof entry==='object'&&entry.category===category)));}
function renderCalendar() {
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test($('#calendar-month').value)) $('#calendar-month').value='2026-12';
  const [year,month]=$('#calendar-month').value.split('-').map(Number),prefix=`${year}-${String(month).padStart(2,'0')}`;
  if(!selectedDate.startsWith(prefix))selectedDate=prefix+'-01';
  $('#calendar-heading').textContent=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
  const grid=$('#calendar-grid');grid.replaceChildren();
  for(const day of calendar.days(year,month)){if(!day){grid.append(document.createElement('span'));continue;}const date=prefix+'-'+String(day).padStart(2,'0'),button=document.createElement('button');button.textContent=day;button.classList.toggle('has-changes',filteredEntries(date).length>0);button.classList.toggle('selected',date===selectedDate);button.setAttribute('aria-pressed',String(date===selectedDate));button.setAttribute('aria-label',`${day} · ${filteredEntries(date).length} cambios`);button.addEventListener('click',()=>{selectedDate=date;renderCalendar();});grid.append(button);}
  $('#change-date').textContent=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(selectedDate));
  const list=$('#change-entries');list.replaceChildren();for(const entry of filteredEntries(selectedDate)){const article=document.createElement('article');article.className='change-entry';const title=document.createElement('h4');title.textContent=typeof entry==='string'?entry:entry.title;article.append(title);if(typeof entry==='object'){const category=document.createElement('span');category.className='category-tag';category.textContent=entry.category;const text=document.createElement('p');text.textContent=entry.text;article.prepend(category);if(entry.text)article.append(text);}list.append(article);}
  if(!list.children.length){const text=document.createElement('p');text.className='empty-state';text.textContent='No hay cambios publicados para esta fecha.';list.append(text);}
}
function localTime(iso) {if(!iso)return '';const date=new Date(iso);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function artValue(form,preset,url) {return form.elements[url].value.trim()||form.elements[preset].value;}
function collectAdmin() {
  if(!adminDraft||!editId)return;const e=editing(),form=$('#admin-form');
  for(const key of ['name','server','manifestUrl','bankEndpoint','headline','message'])e[key]=form.elements[key].value.trim();
  e.port=Number(form.elements.port.value);e.enabled=form.elements.enabled.checked;e.voiceEnabled=form.elements.voiceEnabled.checked;e.accent=form.elements.accent.value;
  e.logo=artValue(form,'logoPreset','logoUrl');e.background=artValue(form,'backgroundPreset','backgroundUrl');e.studioLogo=artValue(form,'studioPreset','studioUrl');adminDraft.discordApplicationId=form.elements.discordApplicationId.value.trim();
  e.notices=$$('.admin-notice').map(row=>Object.fromEntries(['tag','title','text'].map(key=>[key,row.querySelector(`[name=${key}]`).value.trim()])));
  collectChanges();
}
function collectChanges() {
  if(!adminDraft||!editId)return;
  const entries=$$('.admin-change').map(row=>{const time=row.querySelector('[name=publishAt]').value;return {id:row.dataset.id,title:row.querySelector('[name=title]').value.trim(),text:row.querySelector('[name=text]').value.trim(),category:row.querySelector('[name=category]').value,release:row.querySelector('[name=release]').value,published:row.querySelector('[name=published]').checked,publishAt:time&&Number.isFinite(Date.parse(time))?new Date(time).toISOString():''};});
  if(entries.length)editing().changes[editDate]=entries;else delete editing().changes[editDate];
}
function field(label,name,value,kind='input') {const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement(kind);input.name=name;input.value=value;wrapper.append(input);return wrapper;}
function fillAdmin() {
  if(!adminDraft)adminDraft=structuredClone(state.content);
  if(!adminDraft.events.some(e=>e.id===editId))editId=adminDraft.events.some(e=>e.id===selectedEvent)?selectedEvent:adminDraft.events[0].id;
  const select=$('#admin-event-select');select.replaceChildren(...adminDraft.events.map(e=>new Option(e.name,e.id)));select.value=editId;
  const form=$('#admin-form'),e=editing();for(const key of ['name','server','port','manifestUrl','bankEndpoint','headline','message','accent'])form.elements[key].value=e[key]??'';form.elements.enabled.checked=e.enabled;form.elements.server.required=e.enabled;form.elements.voiceEnabled.checked=e.voiceEnabled===true;form.elements.discordApplicationId.value=adminDraft.discordApplicationId;
  for(const [key,preset,url]of [['logo','logoPreset','logoUrl'],['background','backgroundPreset','backgroundUrl'],['studioLogo','studioPreset','studioUrl']]){form.elements[preset].replaceChildren(...Object.entries(artPresets).map(([value,label])=>new Option(label,value)));const local=!!artPresets[e[key]];form.elements[preset].value=local?e[key]:'assets/fonyx-symbol.png';form.elements[url].value=local?'':e[key];}
  editDate=$('#admin-change-date').value||'2026-12-01';renderAdminNotices();renderAdminChanges();setImage($('#admin-logo-preview'),e.logo);syncAdminWorkspace();
}
function syncAdminWorkspace(){
  if(!state?.admin)return;
  window.fonyxAdminWorkspace?.sync({content:adminDraft||state.content,eventId:editId||selectedEvent,github:state.github,administrators:state.administrators,dirty:adminDirty,account:state.account?.name||'',busy:updating||savingAdmin||administratorsChanging});
}
function markAdminDirty(){
  adminDirty=!!adminDraft&&JSON.stringify(adminDraft)!==JSON.stringify(state.content);
  $('#draft-status').textContent=adminDirty?'Cambios sin guardar en la vista previa.':'Vista previa guardada.';syncAdminWorkspace();
}
function renderAdminNotices() {
  const list=$('#admin-notices');list.replaceChildren();
  editing().notices.forEach((notice,index)=>{
    const row=document.createElement('div');row.className='admin-notice';
    const order=document.createElement('div');order.className='admin-notice-order';const label=document.createElement('strong');label.textContent='Aviso '+(index+1);order.append(label);
    for(const [text,offset] of [['Subir',-1],['Bajar',1]]){
      const button=document.createElement('button');button.type='button';button.className='text-link';button.textContent=text;button.disabled=index+offset<0||index+offset>=editing().notices.length;button.setAttribute('aria-label',text+' aviso '+(index+1));
      button.addEventListener('click',()=>{collectAdmin();const notices=editing().notices;[notices[index],notices[index+offset]]=[notices[index+offset],notices[index]];renderAdminNotices();markAdminDirty();});order.append(button);
    }
    row.append(order);
    for(const [key,label,max] of [['tag','Etiqueta',30],['title','Título',100],['text','Texto',1500]]){const input=field(label,key,notice[key],key==='text'?'textarea':'input');input.lastChild.maxLength=max;input.lastChild.required=true;row.append(input);}
    const remove=document.createElement('button');remove.type='button';remove.className='danger-button';remove.textContent='Eliminar aviso';remove.addEventListener('click',()=>{collectAdmin();editing().notices.splice(index,1);renderAdminNotices();markAdminDirty();});row.append(remove);list.append(row);
  });
}
function renderAdminChanges() {
  const list=$('#admin-changes');list.replaceChildren();const entries=editing().changes[editDate]||[];
  entries.forEach((raw,index)=>{const entry=typeof raw==='string'?{id:crypto.randomUUID(),title:raw.slice(0,100),text:raw.length>100?raw:'',category:'General',release:'manual',published:true,publishAt:null}:raw;
    const row=document.createElement('div');row.className='admin-change';row.dataset.id=entry.id;
    const title=field('Título','title',entry.title);title.lastChild.maxLength=100;title.lastChild.required=true;
    const category=field('Categoría','category','','select');calendar.categories.forEach(c=>category.lastChild.add(new Option(c,c)));category.lastChild.value=entry.category;
    const text=field('Texto','text',entry.text,'textarea');text.lastChild.maxLength=3000;text.lastChild.rows=3;
    const release=field('Publicación','release','','select');release.lastChild.add(new Option('Manual','manual'));release.lastChild.add(new Option('Programada','scheduled'));release.lastChild.value=entry.release;
    const time=field('Publicar el día y hora','publishAt',localTime(entry.publishAt));time.lastChild.type='datetime-local';time.lastChild.value=localTime(entry.publishAt);
    const published=field('Publicado (modo manual)','published','');published.className='checkbox-label';published.lastChild.type='checkbox';published.lastChild.checked=entry.published;
    const updateMode=()=>{time.hidden=release.lastChild.value!=='scheduled';published.hidden=release.lastChild.value!=='manual';};release.lastChild.addEventListener('change',updateMode);updateMode();
    const remove=document.createElement('button');remove.type='button';remove.className='danger-button';remove.textContent='Eliminar cambio';remove.addEventListener('click',()=>{collectChanges();editing().changes[editDate].splice(index,1);if(!editing().changes[editDate].length)delete editing().changes[editDate];renderAdminChanges();markAdminDirty();});row.append(title,category,text,release,time,published,remove);list.append(row);
  });if(!entries.length){const text=document.createElement('p');text.className='field-hint';text.textContent='Sin cambios en esta fecha.';list.append(text);}
}
async function saveAdmin(showToast=true) {
  if(savingAdmin||updating)throw new Error('Espera a que termine la operación actual.');
  const form=$('#admin-form'),invalid=form.querySelector(':invalid');
  if(invalid){window.fonyxAdminWorkspace?.revealInvalid(invalid);form.reportValidity();throw new Error('Revisa los campos marcados.');}
  collectAdmin();
  const first=adminDraft.events.find(event=>event.enabled)||adminDraft.events[0];
  adminDraft.server=first.server||state.content.server;adminDraft.port=first.port;adminDraft.manifestUrl=first.manifestUrl||'';
  adminDraft.headline=first.headline;adminDraft.message=first.message;adminDraft.notices=first.notices;adminDraft.changes=first.changes;
  savingAdmin=true;syncAdminWorkspace();$$('#admin-form fieldset').forEach(field=>field.disabled=true);
  try{
    state=await call(api.saveContent(adminDraft));adminDraft=structuredClone(state.content);adminDirty=false;lastContent=JSON.stringify(state.content);render();ping();
    $('#draft-status').textContent='Vista previa guardada. Puedes publicarla en GitHub.';if(showToast)toast('Vista previa guardada.');
  }finally{savingAdmin=false;$$('#admin-form fieldset').forEach(field=>field.disabled=false);syncAdminWorkspace();}
}
function renderGithub(){
  if(!state?.admin)return;
  renderAdministrators();syncAdminWorkspace();
  const github=state.github||{};const scoped=!github.eventId||github.eventId===editId;const packs=scoped?(github.packs||[]):[];$('#github-pack-summary').textContent=scoped?`${packs.filter(p=>p.kind==='data').length} BP · ${packs.filter(p=>p.kind==='resources').length} RP · ${packs.filter(p=>p.status==='new').length} nuevos · ${packs.filter(p=>p.status==='update').length} por actualizar${github.replaceAll?' · Reemplazo completo':''}`:'La selección de addons pertenece a otro evento. Puedes publicar el contenido o cargar los packs de este evento.';
  $('#github-account').textContent=github.connected?`Conectado: ${github.login}. ${github.ready?'Listo para publicar.':'Carga desde GitHub antes de editar en este equipo.'}`:'GitHub sin conectar.';
  $('#github-disconnect').disabled=!github.connected;$('#github-publish').disabled=!github.connected||!github.ready;$('#github-publish-content').disabled=!github.connected||!github.ready;
  $('#github-pack-list').replaceChildren(...packs.map(p=>{const item=document.createElement('li');item.textContent=`${p.name} · ${p.version.join('.')} · ${p.kind==='resources'?'Recursos':'Comportamientos'} · ${{new:'Nuevo',update:'Actualizar',unchanged:'Sin cambios',current:'Publicado'}[p.status]||'Publicado'}${p.bytes?' · '+(p.bytes/1048576).toFixed(1)+' MB':''}`;item.title=p.uuid+(p.source?'\n'+p.source:'');for(const warning of p.warnings||[]){const note=document.createElement('p');note.className='pack-warning';note.textContent=warning;item.append(note);}const remove=document.createElement('button');remove.type='button';remove.className='text-link';remove.textContent='Quitar del evento';remove.addEventListener('click',()=>githubAction(async()=>{state.github=await call(api.githubRemovePack(editId,p.uuid));}));item.append(remove);return item;}));syncAdminWorkspace();
}
function renderAdministrators(){
  if(!state?.admin)return;
  const registry=state.administrators||{},connected=!!state.github?.connected;
  $('#administrators-form fieldset').disabled=administratorsChanging||updating;
  $('#administrator-add').disabled=!connected;$('#administrator-remove').disabled=!connected;
  $('#administrators-status').textContent=administratorsMessage||[registry.source,registry.warning].filter(Boolean).join('. ');
  $('#administrators-list').replaceChildren(...(registry.names||[]).map(name=>{
    const item=document.createElement('li'),label=document.createElement('span');label.textContent=name;item.append(label);
    if(name.toLowerCase()===(registry.owner||'').toLowerCase()){
      const owner=document.createElement('small');owner.textContent='Cuenta principal';item.append(owner);
    }else{
      const remove=document.createElement('button');remove.type='button';remove.className='text-link';remove.textContent='Quitar';remove.setAttribute('aria-label','Quitar administración a '+name);remove.disabled=!connected;
      remove.addEventListener('click',()=>changeAdministrator(name,false));item.append(remove);
    }
    return item;
  }));
}
async function changeAdministrator(name,grant){
  if(!state?.admin||updating||savingAdmin||administratorsChanging)return;
  if(!name.trim())return $('#administrator-name').reportValidity();
  if(!grant&&!confirm('¿Quitar la administración a '+name+'?'))return;
  administratorsMessage='';administratorsChanging=true;renderAdministrators();syncAdminWorkspace();
  try{
    state=await call(api.changeAdministrator(name,grant));$('#administrator-name').value='';render();
    administratorsMessage=grant?'Administrador añadido y guardado en GitHub.':'Administración retirada y guardada en GitHub.';toast(administratorsMessage);
  }catch(error){
    // A remotely revoked actor must lose the local UI even if the write was rejected.
    try{state=await call(api.state());render();}catch{}
    administratorsMessage=error.message;toast(error.message);
  }finally{administratorsChanging=false;renderAdministrators();syncAdminWorkspace();}
}
$('#administrators-form').addEventListener('submit',event=>{event.preventDefault();changeAdministrator($('#administrator-name').value.trim(),true);});
$('#administrator-remove').addEventListener('click',()=>changeAdministrator($('#administrator-name').value.trim(),false));
$('#administrators-refresh').addEventListener('click',async()=>{
  if(administratorsChanging||updating)return;administratorsMessage='';administratorsChanging=true;renderAdministrators();syncAdminWorkspace();
  try{state=await call(api.refreshAdministrators());if(!state.admin){adminDraft=null;adminDirty=false;}render();}
  catch(error){toast(error.message);}
  finally{administratorsChanging=false;renderAdministrators();syncAdminWorkspace();}
});
async function githubAction(action){
  if(!state?.admin||updating||savingAdmin||administratorsChanging)return;
  updating=true;$$('#admin-form fieldset').forEach(f=>f.disabled=true);renderAdministrators();syncAdminWorkspace();
  try{await action();}catch(error){$('#github-progress').textContent=error.message;toast(error.message);}
  finally{updating=false;$$('#admin-form fieldset').forEach(f=>f.disabled=false);renderGithub();}
}
$('#github-token').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#github-connect').click();}});
$('#github-connect').addEventListener('click',()=>githubAction(async()=>{try{state.github=await call(api.githubConnect($('#github-token').value.trim(),$('#github-remember').checked));$('#github-progress').textContent='Conectado. Carga desde GitHub antes de editar.';}finally{$('#github-token').value='';}}));
$('#github-disconnect').addEventListener('click',()=>githubAction(async()=>{state.github=await call(api.githubDisconnect());$('#github-progress').textContent='Autorización eliminada de este equipo.';}));
$('#github-token-help').addEventListener('click',async()=>{try{await call(api.githubTokenHelp());}catch(error){toast(error.message);}});
$('#github-addon').addEventListener('click',()=>githubAction(async()=>{state.github=await call(api.githubAddon(editId,false));$('#github-progress').textContent='Addon preparado. Revisa el evento seleccionado antes de publicar.';}));
$('#github-load-packs').addEventListener('click',()=>githubAction(async()=>{if(state.github?.hasChanges&&!confirm('¿Descartar los cambios de packs y cargar los publicados?'))return;state.github=await call(api.githubPacks(editId));$('#github-progress').textContent='Packs publicados cargados. Puedes añadir, reemplazar o quitar antes de publicar.';}));
$('#github-replace-packs').addEventListener('click',()=>githubAction(async()=>{state.github=await call(api.githubAddon(editId,true));$('#github-progress').textContent='Conjunto completo preparado. Al publicar sustituirá la lista anterior de este evento.';}));
$('#github-export-packs').addEventListener('click',()=>githubAction(async()=>{if(await call(api.githubExportPacks(editId)))$('#github-progress').textContent='packs.zip exportado.';}));
$('#github-clear-addon').addEventListener('click',()=>githubAction(async()=>{state.github=await call(api.githubClearAddon());}));
async function publishGithub(includePacks){
  try{await saveAdmin(false);}catch(error){return toast(error.message);}
  const label=includePacks?'Publicar el contenido y los cambios de addons preparados':'Publicar solo el contenido; los addons preparados quedarán pendientes';
  if(!confirm(label+' en GitHub?'))return;
  await githubAction(async()=>{const result=await call(api.githubPublish(editId,includePacks));state=result.state;adminDraft=structuredClone(state.content);adminDirty=false;lastContent=JSON.stringify(state.content);render();$('#github-progress').textContent=includePacks?'Contenido y addons publicados en GitHub.':'Contenido publicado en GitHub. La selección de addons se conserva.';$('#draft-status').textContent='Publicado en GitHub.';});
}
$('#github-publish').addEventListener('click',()=>publishGithub(true));
$('#github-publish-content').addEventListener('click',()=>publishGithub(false));
api.onGithubProgress(message=>{$('#github-progress').textContent=message;});
$$('[data-window]').forEach(b=>b.addEventListener('click',()=>api.window(b.dataset.window)));
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$$('[data-open-settings]').forEach(b=>b.addEventListener('click',openSettings));
async function configureLauncher(){try{$('#settings-dialog').close();state=await window.fonyxOnboarding.run(await call(api.state()),{force:true});window.fonyxVoice.configure(state.settings);render();ping();}catch(error){toast(error.message);}}
$$('[data-account-settings]').forEach(b=>b.addEventListener('click',configureLauncher));
$('#reconfigure-setup').addEventListener('click',configureLauncher);
$$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('[data-social]').forEach(b=>b.addEventListener('click',async()=>{try{await call(api.social(b.dataset.social));}catch(error){toast(error.message);}}));
$('#brand-home').addEventListener('click',()=>navigate('home'));
$('#refresh-server').addEventListener('click',ping);$('#play-button').addEventListener('click',()=>play());
$('#profile-select').addEventListener('change',profileFields);
$('#settings-form').addEventListener('submit',async e=>{e.preventDefault();try{const form=e.currentTarget,f=form.elements,values={root:f.root.value,loadingStyle:f.loadingStyle.value,profile:f.profile.value,profileName:f.profileName.value,trayOnPlay:f.trayOnPlay.checked,voiceMicMode:f.voiceMicMode.value,voiceHotkeys:{enabled:f.voiceHotkeysEnabled.checked,mute:f.voiceHotkeyMute.value.trim()||'M',deafen:f.voiceHotkeyDeafen.value.trim()||'N',pushToTalk:f.voiceHotkeyPushToTalk.value.trim()||'V'}};for(const key of settingsKeys)values[key]=f[key].checked;const wantUserView=f.userView.checked;state=await call(api.saveSettings(values));await call(api.applyHotkeys());if(state.adminEligible&&wantUserView!==(state.settings.userView===true))state=await call(api.setUserView(wantUserView));window.fonyxVoice.configure(state.settings);render();$('#settings-dialog').close();toast('Ajustes guardados.');ping();}catch(error){toast(error.message);}});
$('#choose-folder').addEventListener('click',async()=>{try{state=await call(api.chooseFolder());$('#settings-dialog').close();await openSettings();renderProfile();}catch(error){toast(error.message);}});
$('#choose-avatar').addEventListener('click',async()=>{try{state=await call(api.chooseAvatar($('#profile-select').value));renderProfile();}catch(error){toast(error.message);}});
$('#choose-skin').addEventListener('click',async()=>{try{state=await call(api.chooseAvatar($('#profile-select').value,true));renderProfile();}catch(error){toast(error.message);}});
$('#update-only').addEventListener('click',()=>{$('#settings-dialog').close();play(false);});$('#close-progress').addEventListener('click',()=>$('#update-dialog').close());$('#update-dialog').addEventListener('cancel',e=>{if(updating)e.preventDefault();});
$('#revil-play').addEventListener('click',()=>{if(playingRevil)return stopRevil();playingRevil=true;$('#revil-cover').hidden=true;$('#revil-gif').src='../../assets/revil.gif';$('#revil-gif').hidden=false;$('#revil-play').textContent='Detener secuencia';});
calendar.categories.forEach(c=>$('#category-filter').add(new Option(c,c)));$('#category-filter').addEventListener('change',renderCalendar);$('#calendar-month').addEventListener('change',()=>{if(/^20\d\d-(0[1-9]|1[0-2])$/.test($('#calendar-month').value))renderCalendar();});
for(const [id,offset]of [['previous-month',-1],['next-month',1]])$('#'+id).addEventListener('click',()=>{const [y,m]=$('#calendar-month').value.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+offset,1));if(date.getUTCFullYear()<2000||date.getUTCFullYear()>2099)return;$('#calendar-month').value=date.toISOString().slice(0,7);renderCalendar();});
$('#admin-form').addEventListener('submit',async e=>{e.preventDefault();try{await saveAdmin();}catch(error){toast(error.message);}});
$('#admin-form').addEventListener('input',event=>{if(['admin-pack-search','github-token','github-remember'].includes(event.target.id))return;collectAdmin();markAdminDirty();const form=$('#admin-form');form.elements.server.required=form.elements.enabled.checked;setImage($('#admin-logo-preview'),artValue(form,'logoPreset','logoUrl'));});
$('#admin-event-select').addEventListener('change',()=>{if(updating||savingAdmin||administratorsChanging)return;collectAdmin();editId=$('#admin-event-select').value;fillAdmin();renderGithub();});
$('#admin-change-date').addEventListener('change',()=>{collectChanges();editDate=$('#admin-change-date').value;if(!/^20\d\d-\d\d-\d\d$/.test(editDate)){editDate='2026-12-01';$('#admin-change-date').value=editDate;}renderAdminChanges();});
$('#new-event').addEventListener('click',()=>{if(updating||savingAdmin||administratorsChanging)return;collectAdmin();if(adminDraft.events.length>=16)return toast('Máximo 16 eventos.');const e={id:'evento-'+crypto.randomUUID().slice(0,8),name:'Nuevo evento',enabled:false,voiceEnabled:false,server:'',port:19132,manifestUrl:'',logo:'assets/fonyx-symbol.png',studioLogo:'assets/fonyx-classic.png',background:'assets/map.png',accent:'#ffd465',headline:'',message:'',notices:[],changes:{}};adminDraft.events.push(e);editId=e.id;fillAdmin();markAdminDirty();window.fonyxAdminWorkspace?.show('event');$('#draft-status').textContent='Evento creado en el borrador. Guarda para aplicarlo.';});
$('#delete-event').addEventListener('click',()=>{if(updating||savingAdmin||administratorsChanging)return;if(adminDraft.events.length===1)return toast('Conserva al menos un evento.');if(!confirm('¿Eliminar este evento del borrador? Se aplicará al guardar.'))return;adminDraft.events=adminDraft.events.filter(e=>e.id!==editId);editId=adminDraft.events[0].id;fillAdmin();markAdminDirty();});
$('#add-notice').addEventListener('click',()=>{collectAdmin();if(editing().notices.length>=20)return toast('Máximo 20 avisos.');editing().notices.push({tag:'Aviso',title:'',text:''});renderAdminNotices();markAdminDirty();});
$('#add-change').addEventListener('click',()=>{collectAdmin();const entries=editing().changes[editDate]||[];if(entries.length>=30)return toast('Máximo 30 cambios por fecha.');entries.push({id:crypto.randomUUID(),category:'General',title:'',text:'',release:'manual',published:false,publishAt:null});editing().changes[editDate]=entries;renderAdminChanges();markAdminDirty();});
$('#export-content').addEventListener('click',async()=>{try{await saveAdmin(false);if(await call(api.exportContent()))toast('Publicación exportada.');}catch(error){toast(error.message);}});
$('#refresh-content').addEventListener('click',async()=>{if(!confirm('¿Reemplazar la vista previa y el borrador por la publicación de GitHub?'))return;try{state=await call(api.refreshContent());adminDraft=null;adminDirty=false;render();ping();}catch(error){toast(error.message);}});
$('#retry-progress').addEventListener('click',()=>{$('#update-dialog').close();play(lastPlayOpen);});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey&&event.key.toLowerCase()==='s'&&state?.admin&&page==='admin'){
    event.preventDefault();if(!savingAdmin&&!updating)saveAdmin().catch(error=>toast(error.message));
  }
});
document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement&&!img.src.endsWith('fonyx-symbol.png'))img.src='../../assets/fonyx-symbol.png';},true);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>state&&renderEvent());api.onProgress(progress);
async function refresh() {if(!state||updating||savingAdmin||page==='admin'||$('#settings-dialog').open)return;try{const next=await call(api.state());if(next.admin!==state.admin||next.adminEligible!==state.adminEligible||JSON.stringify(next.content)!==lastContent){state=next;lastContent=JSON.stringify(state.content);render();ping();}else if(page==='changes')renderCalendar();}catch{}}
api.onVoice(async event=>{if(event.type==='account'&&state){if(!event.connected){state.admin=false;state.adminEligible=false;state.account={name:'',connected:false};adminDraft=null;adminDirty=false;render();}try{const previous=state.account?.name;state=await call(api.state());if(previous!==state.account?.name){adminDraft=null;adminDirty=false;}render();}catch{renderProfile();}}});
api.onAdministratorsChanged(async()=>{try{state=await call(api.state());if(!state.admin){adminDraft=null;adminDirty=false;}render();}catch{}});
api.onNavigate(page=>{if(state)navigate(page);});
async function init() {try{state=await call(api.state());lastContent=JSON.stringify(state.content);render();await window.fonyxIntro.finish({version:state.version,reducedMotion:state.settings.reducedMotion});state=await window.fonyxOnboarding.run(state);window.fonyxVoice.configure(state.settings);render();ping();await call(api.applyHotkeys());setInterval(()=>{if(!document.hidden&&!updating)ping();},45000);setInterval(refresh,30000);}catch(error){toast(error.message);}finally{$('#loading-screen').hidden=true;}}
init();
