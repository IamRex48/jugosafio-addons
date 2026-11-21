(() => {
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const tabs=$$('[data-admin-view]'),panels=$$('[data-admin-panel]');
  let active='overview';
  try{const saved=sessionStorage.getItem('fonyx-admin-section');if(tabs.some(tab=>tab.dataset.adminView===saved))active=saved;}catch{}
  function show(name,{focus=false}={}){
    if(!tabs.some(tab=>tab.dataset.adminView===name))return;
    active=name;
    for(const tab of tabs){const selected=tab.dataset.adminView===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.classList.toggle('selected',selected);}
    for(const panel of panels)panel.hidden=panel.dataset.adminPanel!==name;
    $('#admin-save-bar').hidden=!['content','calendar','event'].includes(name);
    try{sessionStorage.setItem('fonyx-admin-section',name);}catch{}
    if(focus)$('#admin-panel-'+name+' h3')?.focus({preventScroll:true});
  }
  for(const tab of tabs){
    tab.addEventListener('click',()=>show(tab.dataset.adminView));
    tab.addEventListener('keydown',event=>{
      let index=tabs.indexOf(tab);
      if(event.key==='ArrowDown'||event.key==='ArrowRight')index=(index+1)%tabs.length;
      else if(event.key==='ArrowUp'||event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')index=0;
      else if(event.key==='End')index=tabs.length-1;
      else return;
      event.preventDefault();show(tabs[index].dataset.adminView);tabs[index].focus();
    });
  }
  for(const button of $$('[data-admin-go]'))button.addEventListener('click',()=>show(button.dataset.adminGo,{focus:true}));
  function filterPacks(){
    const query=$('#admin-pack-search').value.trim().toLocaleLowerCase('es');
    for(const row of $$('#github-pack-list>li'))row.hidden=!!query&&!row.textContent.toLocaleLowerCase('es').includes(query);
  }
  $('#admin-pack-search').addEventListener('input',filterPacks);
  $('#admin-pack-search').addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
  function sync({content,eventId,github={},administrators={},dirty=false,account='',busy=false}={}){
    const event=content?.events?.find(event=>event.id===eventId)||content?.events?.[0];if(!event)return;
    const same=!github.eventId||github.eventId===event.id,packs=same?(github.packs||[]):[];
    const notices=event.notices?.length||0,days=Object.keys(event.changes||{}).length;
    $('#admin-overview-name').textContent=event.name||'Evento sin nombre';
    $('#admin-overview-server').textContent=event.server?event.server+':'+event.port:'Servidor pendiente';
    const badge=$('#admin-overview-enabled');badge.textContent=event.enabled?'Disponible para jugar':'Evento bloqueado';badge.dataset.enabled=String(event.enabled);
    const logo=$('#admin-overview-logo');const source=event.logo?.startsWith('assets/')?'../../'+event.logo:/^https:\/\//.test(event.logo||'')?event.logo:'../../assets/fonyx-symbol.png';if(logo.getAttribute('src')!==source)logo.src=source;
    $('#admin-overview-notices').textContent=notices+' aviso'+(notices===1?'':'s')+' · '+(event.headline?'Mensaje del día configurado':'Sin mensaje del día');
    $('#admin-overview-changes').textContent=days+' fecha'+(days===1?'':'s')+' con cambios';
    $('#admin-overview-packs').textContent=github.eventId?packs.length+' packs en la selección':'Consulta los packs publicados';
    $('#admin-overview-people').textContent=(administrators.names?.length||0)+' cuentas con acceso';
    $('#admin-overview-publish').textContent=github.connected?'GitHub conectado'+(github.login?' como '+github.login:''):'Conecta GitHub para publicar';
    $('#admin-connection-label').textContent=github.connected?'GitHub conectado':'GitHub sin conectar';$('#admin-connection-label').dataset.connected=String(!!github.connected);
    $('#admin-nav-account').textContent=account;
    $('#admin-publish-content-summary').textContent=(content?.events?.length||0)+' eventos · '+notices+' avisos en este evento';
    $('#admin-publish-packs-summary').textContent=github.hasChanges?'Hay cambios de addons preparados':'Los addons publicados se conservan';
    $('#admin-draft-dot').dataset.dirty=String(dirty);$('#admin-draft-dot').textContent=dirty?'Cambios sin guardar':'Vista previa guardada';
    $('#admin-save-hint').textContent=dirty?'Guarda los cambios para verlos en el launcher.':'La vista previa está guardada en este equipo.';
    for(const id of ['admin-event-select','new-event','delete-event'])$('#'+id).disabled=busy;
    filterPacks();
  }
  window.fonyxAdminWorkspace={show,sync,active:()=>active,revealInvalid(element){const panel=element?.closest('[data-admin-panel]');if(panel)show(panel.dataset.adminPanel);}};
  show(active);
})();
