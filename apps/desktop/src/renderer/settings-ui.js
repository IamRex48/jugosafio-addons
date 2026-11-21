(() => {
  const dialog=document.querySelector('#settings-dialog');
  const tabs=[...dialog.querySelectorAll('[data-settings-tab]')];
  function select(tab){
    for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;}
    for(const panel of dialog.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==tab.dataset.settingsTab;
    dialog.querySelector('.settings-panels').scrollTop=0;
  }
  for(const tab of tabs){
    tab.addEventListener('click',()=>select(tab));
    tab.addEventListener('keydown',event=>{
      const index=tabs.indexOf(tab),next=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if(next<0)return;event.preventDefault();select(tabs[next]);tabs[next].focus();
    });
  }
  dialog.addEventListener('invalid',event=>{const panel=event.target.closest('[data-settings-panel]');if(panel)select(tabs.find(tab=>tab.dataset.settingsTab===panel.dataset.settingsPanel));},true);
})();
