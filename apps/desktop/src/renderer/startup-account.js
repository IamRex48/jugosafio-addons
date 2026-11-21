(() => {
  const api=window.fonyx,$=selector=>document.querySelector(selector);
  const call=async promise=>{const result=await promise;if(!result.ok)throw new Error(result.error);return result.value;};
  let retry,restoring=false;
  $('#startup-open-ms').addEventListener('click',()=>call(api.voiceMicrosoft()).catch(error=>{$('#startup-message').textContent=error.message;}));
  $('#startup-account-retry').addEventListener('click',()=>retry?.());
  $('#startup-account-exit').addEventListener('click',()=>api.window('quit'));
  api.onVoice(event=>{
    if(!restoring)return;
    if(event.type==='microsoft-code'){
      $('#startup-ms-code').value=event.code;$('#startup-auth').hidden=false;
      $('#startup-message').textContent='Microsoft necesita confirmar tu sesión. Abre Microsoft e introduce este código con tu propia cuenta.';
    }else if(event.type==='account-retry')$('#startup-message').textContent='Completando la comprobación de Microsoft…';
  });
  window.fonyxStartupAccount={async restore(state){
    if(!state.settings.setupComplete||state.account.connected)return state;
    const screen=$('#loading-screen'),wasHidden=screen.hidden;screen.classList.remove('startup-leaving');screen.hidden=false;
    restoring=true;$('#startup-account-actions').hidden=false;
    try{
      for(;;){
        $('#startup-account-retry').hidden=true;$('#startup-auth').hidden=true;
        $('#startup-message').textContent='Conectando tu cuenta Microsoft…';
        try{return await call(api.accountConnect());}
        catch(error){
          $('#startup-message').textContent=error.message;$('#startup-auth').hidden=true;
          await new Promise(resolve=>{retry=resolve;$('#startup-account-retry').hidden=false;});retry=null;
        }
      }
    }finally{if(wasHidden)screen.hidden=true;restoring=false;retry=null;$('#startup-account-actions').hidden=true;$('#startup-ms-code').value='';$('#startup-message').textContent='Preparando el launcher';}
  }};
})();
