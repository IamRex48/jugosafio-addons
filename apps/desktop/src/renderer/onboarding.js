(() => {
  const api=window.fonyx,$=selector=>document.querySelector(selector),dialog=$('#setup-dialog');
  const call=async promise=>{const result=await promise;if(!result.ok)throw new Error(result.error);return result.value;};
  let current,check,step=0,busy=false,resolveRun,stream,context,meterTimer,tested=false,finished=false,audioReady=false;
  const message=text=>{$('#setup-message').textContent=text;};
  async function stopAudio(){clearInterval(meterTimer);stream?.getTracks().forEach(track=>track.stop());stream=null;if(context){const old=context;context=null;await old.close().catch(()=>{});}$('#setup-meter').value=0;}
  function render(){
    for(const element of dialog.querySelectorAll('[data-setup-panel]'))element.hidden=Number(element.dataset.setupPanel)!==step;
    const located=check?.rootValid&&check?.installationValid;
    for(const button of dialog.querySelectorAll('[data-setup-step]')){const index=Number(button.dataset.setupStep);button.disabled=busy||index>step||(index===0&&located);button.setAttribute('aria-current',index===step?'step':'false');button.classList.toggle('complete',index<step);}
    $('#setup-back').disabled=busy||step===0||(step===1&&located);$('#setup-next').disabled=busy||(step===0&&!located)||(step===2&&current.account.connected&&!check?.profileValid);
    $('#setup-next').textContent=busy?'Un momento…':step===2?(current.account.connected?'Terminar y entrar':'Conectar Microsoft'):'Continuar';
    $('#setup-location').textContent=check?.root||'No encontrada';$('#setup-executable').textContent=check?.executable||'No encontrado';
    $('#setup-install-card').hidden=!!check?.installationValid;$('#setup-root-card').hidden=!!check?.rootValid;
    $('#setup-folder-status').textContent=located?'Minecraft y sus datos están localizados.':[check?.problems?.rootValid,check?.problems?.installationValid].filter(Boolean).join(' ');
    $('#setup-open-game').disabled=busy||!check?.installationValid;$('#setup-refresh').disabled=busy;
    $('#setup-account-name').textContent=current.account.connected?current.account.name:'Conecta la cuenta con la que juegas a Minecraft.';
    $('#setup-account-status').textContent=current.account.connected?'Cuenta confirmada por Microsoft':'Tu contraseña se introduce únicamente en Microsoft.';
    $('#setup-account-folder').hidden=!current.account.connected||check?.profileValid;
    $('#setup-account-path').textContent=current.account.connected&&check?.profileValid?'Minecraft usará: '+check.profile:'';
    const choices=$('#setup-data-choices');choices.replaceChildren();
    if(current.account.connected&&!check?.profileValid)for(const [index,folder] of (check?.choices||[]).entries()){
      const button=document.createElement('button'),label=document.createElement('strong'),location=document.createElement('code');button.type='button';button.className='setup-data-option';button.disabled=busy;label.textContent='Opción '+String.fromCharCode(65+index);location.textContent=folder;button.append(label,location);
      button.addEventListener('click',async()=>{busy=true;render();try{check=await call(api.setupSelectData(folder));message('Ubicación guardada. Tu cuenta Microsoft sigue siendo '+current.account.name+'.');}catch(error){message(error.message);}finally{busy=false;render();}});choices.append(button);
    }
    $('#setup-data-question').hidden=(check?.choices?.length||0)<2;
    $('#setup-find-account').hidden=(check?.choices?.length||0)>0;
    for(const element of dialog.querySelectorAll('[data-setup-choose],#setup-test-mic,#setup-test-output'))element.disabled=busy;
    $('#setup-input').disabled=busy||!audioReady;$('#setup-output').disabled=busy||!audioReady;
  }
  async function prepareDevices(){
    audioReady=true;await devices();
  }
  async function devices(){
    const list=await navigator.mediaDevices.enumerateDevices();
    for(const [id,kind,saved] of [['setup-input','audioinput',current.settings.voiceInput||''],['setup-output','audiooutput',current.settings.voiceOutput||'']]){
      const select=$('#'+id),selected=select.options.length>1?select.value:saved;select.replaceChildren(new Option('Predeterminado del sistema',''));
      list.filter(device=>device.kind===kind&&device.label&&device.deviceId&&!['default','communications'].includes(device.deviceId)).forEach(device=>select.add(new Option(device.label,device.deviceId)));
      if(selected&&[...select.options].some(option=>option.value===selected))select.value=selected;
      else if(selected)message('El dispositivo guardado no está disponible. Elige uno o usa el predeterminado del sistema.');
    }
  }
  async function output(){
    const id=$('#setup-output').value;
    if(context.setSinkId)await context.setSinkId(id);else if(id)throw new Error('Selecciona Predeterminado del sistema para la salida.');
  }
  async function microphone(){
    await stopAudio();tested=false;await call(api.audioPrepare());
    const id=$('#setup-input').value;
    stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,...(id?{deviceId:{exact:id}}:{})}});
    try{
      context=new AudioContext();await context.resume();await devices();await output();const source=context.createMediaStreamSource(stream),meter=context.createAnalyser();meter.fftSize=512;source.connect(meter);const samples=new Uint8Array(512);
      meterTimer=setInterval(()=>{meter.getByteTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=((sample-128)/128)**2;$('#setup-meter').value=Math.min(100,Math.sqrt(sum/samples.length)*300);},100);
      tested=true;audioReady=true;message('Habla para comprobar el micrófono. Solo se muestra el nivel; no se graba ni se transmite.');
    }catch(error){await stopAudio();throw error;}
  }
  async function account(){
    busy=true;message('Comprobando tu cuenta Microsoft…');render();
    try{current=await call(api.accountConnect());check=await call(api.setupStatus());$('#setup-ms-auth').hidden=true;message(check.profileValid?'Tu cuenta está lista. Ya puedes entrar.':check.choices?.length>1?'Cuenta confirmada. Elige la ubicación que usas tú.':'Cuenta confirmada. No encontramos los datos de Minecraft; abre el juego una vez o busca su ubicación.');}
    catch(error){message(error.message);}
    finally{busy=false;render();}
  }
  $('#setup-next').addEventListener('click',async()=>{
    if(busy)return;message('');
    if(step===2&&!current.account.connected)return account();
    busy=true;render();
    try{
      if(step===0){check=await call(api.setupStatus());if(!check.rootValid||!check.installationValid)throw new Error('Selecciona la instalación y los datos de Minecraft.');step=1;await prepareDevices();}
      else if(step===1){await call(api.setupAudio({inputId:$('#setup-input').value,outputId:$('#setup-output').value}));current.settings.voiceInput=$('#setup-input').value;current.settings.voiceOutput=$('#setup-output').value;await stopAudio();step=2;message('');}
      else{const state=await call(api.setupFinish());await stopAudio();finished=true;dialog.close();resolveRun(state);}
    }catch(error){message(error.name==='NotAllowedError'?'Permite el micrófono para usar la voz obligatoria de Jugosafio.':error.message);}
    finally{busy=false;render();}
  });
  async function move(index){await stopAudio();step=index;message('');busy=step===1;render();try{if(step===1)await prepareDevices();}catch(error){message('No se pudieron listar los dispositivos. Puedes continuar con los predeterminados o probar el micrófono cuando quieras.');}finally{busy=false;render();}}
  $('#setup-back').addEventListener('click',()=>move(Math.max(0,step-1)));
  for(const button of dialog.querySelectorAll('[data-setup-step]'))button.addEventListener('click',()=>move(Number(button.dataset.setupStep)));
  for(const button of dialog.querySelectorAll('[data-setup-choose]'))button.addEventListener('click',async()=>{busy=true;message('');render();try{check=await call(api.setupChoose(button.dataset.setupChoose));}catch(error){message(error.message);}finally{busy=false;render();}});
  $('#setup-test-mic').addEventListener('click',async()=>{busy=true;render();try{await microphone();}catch(error){message(error.message);}finally{busy=false;render();}});
  $('#setup-test-output').addEventListener('click',async()=>{busy=true;render();try{if(!context){context=new AudioContext();await context.resume();}await output();const tone=context.createOscillator(),gain=context.createGain();gain.gain.setValueAtTime(0,context.currentTime);gain.gain.linearRampToValueAtTime(.06,context.currentTime+.03);gain.gain.linearRampToValueAtTime(0,context.currentTime+.35);tone.frequency.value=523; tone.connect(gain);gain.connect(context.destination);tone.start();tone.stop(context.currentTime+.4);tone.onended=()=>{tone.disconnect();gain.disconnect();};message('Se reprodujo un tono corto por la salida elegida.');}catch(error){message(error.message);}finally{busy=false;render();}});
  $('#setup-input').addEventListener('change',()=>{tested=false;stopAudio();});$('#setup-output').addEventListener('change',()=>{if(context)output().catch(error=>message(error.message));});
  $('#setup-open-ms').addEventListener('click',()=>call(api.voiceMicrosoft()).catch(error=>message(error.message)));
  $('#setup-exit').addEventListener('click',()=>api.window('quit'));
  $('#setup-open-game').addEventListener('click',()=>call(api.setupOpenGame()).then(()=>message('Abre Minecraft con tu cuenta una vez y ciérralo. Después pulsa Volver a comprobar.')).catch(error=>message(error.message)));
  $('#setup-refresh').addEventListener('click',async()=>{busy=true;render();try{check=await call(api.setupRefresh());message('Ubicaciones revisadas.');}catch(error){message(error.message);}finally{busy=false;render();}});
  $('#setup-cancel-login').addEventListener('click',()=>call(api.accountCancel()).then(()=>{$('#setup-ms-auth').hidden=true;message('Conexión cancelada. Conecta tu propia cuenta Microsoft para continuar.');}).catch(error=>message(error.message)));
  dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.addEventListener('close',()=>{if(!finished&&resolveRun&&!dialog.open)dialog.showModal();});
  api.onVoice(event=>{if(dialog.open&&event.type==='microsoft-code'){$('#setup-ms-code').value=event.code;$('#setup-ms-auth').hidden=false;message('Introduce el código en Microsoft para continuar.');}else if(dialog.open&&event.type==='account-retry')message('Microsoft ya autorizó la cuenta. Completando la comprobación…');});
  window.addEventListener('beforeunload',stopAudio);
  window.fonyxOnboarding={async run(state,{force=false}={}){
    if(dialog.open)throw new Error('La configuración ya está abierta.');
    current=state;check=await call(api.setupStatus());step=check.rootValid&&check.installationValid?1:0;busy=false;tested=false;finished=false;audioReady=false;$('#setup-ms-auth').hidden=true;message('');
    const ready=check.complete&&check.rootValid&&check.profileValid&&check.installationValid;
    if(ready&&state.account.connected&&!force)return state;
    const finishedPromise=new Promise(resolve=>{resolveRun=resolve;});
    if(check.complete&&!force)step=2;
    render();dialog.showModal();
    if(step===1)await move(1);
    if(ready&&!force){await account();if(current.account.connected&&check.profileValid){const restored=await call(api.setupFinish());finished=true;dialog.close();return restored;}}
    return finishedPromise;
  }};
})();
