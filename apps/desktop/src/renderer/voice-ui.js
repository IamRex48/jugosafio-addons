(() => {
  const api=window.fonyx,$=s=>document.querySelector(s);
  let active=false,connecting=false,generation=0,verified=false,eventId='',shownWarning=false,inputId='',outputId='',verificationMode='direct',micMode='open';
  const invoke=async promise=>{const r=await promise;if(!r.ok)throw new Error(r.error);return r.value;};
  const warning=message=>{$('#voice-warning').textContent=message;};
  const audio=new window.FonyxVoiceAudio.NativeVoiceAudio({sendSignal:(peer,payload)=>invoke(api.voiceSignal(peer,payload)),onWarning:warning,onChange:render,onLevel:level=>{$('#voice-meter').value=level;api.voiceLevel(level).catch(()=>{});}});
  function render(){
    $('#voice-disconnect').disabled=!connecting&&!active;
    $('#voice-room').disabled=connecting||active;$('#voice-sign-out').disabled=connecting||active||!$('#voice-name').value;
    $('#voice-verification-mode').disabled=connecting||active;
    $('#voice-mute').disabled=!active;$('#voice-deafen').disabled=!active;$('#voice-input').disabled=!active;$('#voice-output').disabled=!active;
    $('#voice-mute').setAttribute('aria-pressed',String(audio.muted));$('#voice-deafen').setAttribute('aria-pressed',String(audio.deafened));
    $('#voice-mute').textContent=audio.muted?'Activar micrófono':'Silenciar micrófono';$('#voice-deafen').textContent=audio.deafened?'Volver a escuchar':'Dejar de escuchar';
    $('#voice-audio-state').textContent=!active?'Micrófono apagado':!verified?'Micrófono preparado; esperando verificación':audio.forcedMute?'Micrófono silenciado por el servidor':audio.forcedDeafen?'Audio desactivado por el servidor':audio.muted||audio.deafened?'Micrófono silenciado':audio.pushToTalk&&!audio.pttHeld?'Mantén pulsada tu tecla para hablar':'Micrófono activo';
    const list=$('#voice-peer-list');list.replaceChildren();
    for(const [name,peer] of audio.peers){const li=document.createElement('li'),detail=document.createElement('span');li.textContent=name;detail.textContent=peer.pc.connectionState==='connected'?'Audio conectado':'Conectando audio…';li.append(detail);list.append(li);}
    if(!list.children.length){const li=document.createElement('li');li.textContent=verified?'No hay jugadores con voz dentro del alcance.':'Sin conexión de voz.';list.append(li);}
  }
  async function leave(){++generation;active=false;connecting=false;verified=false;$('#voice-verification').hidden=true;$('#voice-auth').hidden=true;$('#voice-meter').value=0;$('#voice-state').textContent='Desconectado';await audio.stop();await invoke(api.voiceDisconnect()).catch(()=>{});render();}
  async function connect(e){
    e.preventDefault();if(active){if(eventId===audio.eventId){await invoke(api.play(eventId));return true;}await leave();}if(connecting)throw new Error('La voz se está conectando.');
    const options={room:$('#voice-room').value.trim()},operation=++generation;
    connecting=true;shownWarning=false;warning('');render();$('#voice-state').textContent='Conectando tu cuenta Microsoft…';
    try{
      const account=await invoke(api.voicePrepare(eventId));if(operation!==generation)return;
      options.name=account.name;$('#voice-name').value=account.name;$('#voice-auth').hidden=true;$('#voice-state').textContent='Preparando micrófono…';
      await audio.start({name:options.name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase(),inputId,outputId});if(operation!==generation)return;
      await invoke(api.voiceConnect(options));if(operation!==generation)return;
      active=true;audio.eventId=eventId;
      audio.setControls({pushToTalk:micMode==='pushToTalk',pttHeld:false});
      const devices=await navigator.mediaDevices.enumerateDevices();if(operation!==generation)return;
      for(const [id,kind,selected] of [['voice-input','audioinput',inputId],['voice-output','audiooutput',outputId]]){const select=$('#'+id);select.replaceChildren(new Option('Predeterminado del sistema',''));devices.filter(d=>d.kind===kind&&d.deviceId!=='default'&&d.deviceId!=='communications').forEach((d,i)=>select.add(new Option(d.label||'Dispositivo '+(i+1),d.deviceId)));select.value=selected;}
      return true;
    }catch(error){if(operation===generation){await leave();warning(error.name==='NotAllowedError'?'No se permitió el micrófono. Revisa el permiso de Windows y vuelve a conectar.':error.message);}throw error;}
    finally{if(operation===generation)connecting=false;render();}
  }
  $('#voice-form').addEventListener('submit',e=>e.preventDefault());$('#voice-disconnect').addEventListener('click',leave);
  function setMute(value){audio.setControls({muted:!!value});return invoke(api.voiceControls({muted:audio.muted,deafened:audio.deafened})).catch(e=>warning(e.message));}
  function setDeafen(value){audio.setControls({deafened:!!value});return invoke(api.voiceControls({muted:audio.muted,deafened:audio.deafened})).catch(e=>warning(e.message));}
  $('#voice-mute').addEventListener('click',()=>setMute(!audio.muted));
  $('#voice-deafen').addEventListener('click',()=>setDeafen(!audio.deafened));
  api.onVoiceCommand(({action,value})=>{if(!active)return;if(action==='mute')setMute(typeof value==='boolean'?value:!audio.muted);else if(action==='deafen')setDeafen(typeof value==='boolean'?value:!audio.deafened);else if(action==='transmit')audio.setControls({pttHeld:value===true});render();});
  $('#voice-volume').addEventListener('input',()=>audio.setControls({volume:Number($('#voice-volume').value)/100}));
  $('#voice-input').addEventListener('change',async()=>{try{await audio.setInput($('#voice-input').value);inputId=$('#voice-input').value;await invoke(api.setupAudio({inputId,outputId}));}catch{warning('No se pudo cambiar el micrófono. Se conserva el anterior.');$('#voice-input').value=inputId;}});
  $('#voice-output').addEventListener('change',async()=>{try{await audio.setOutput($('#voice-output').value);outputId=$('#voice-output').value;await invoke(api.setupAudio({inputId,outputId}));}catch(error){warning(error.message);$('#voice-output').value=outputId;}});
  $('#voice-microsoft').addEventListener('click',()=>invoke(api.voiceMicrosoft()).catch(e=>warning(e.message)));
  $('#voice-copy').addEventListener('click',()=>invoke(api.voiceCopyCode()).then(()=>warning('Comando copiado. Pégalo en el chat de Minecraft una sola vez.')).catch(error=>warning(error.message)));
  $('#voice-verification-mode').addEventListener('change',async()=>{try{verificationMode=await invoke(api.voiceMode($('#voice-verification-mode').value));}catch(error){$('#voice-verification-mode').value=verificationMode;warning(error.message);}});
  $('#voice-sign-out').addEventListener('click',()=>invoke(api.voiceSignOut()).then(()=>{$('#voice-name').value='';render();}).catch(e=>warning(e.message)));
  api.onVoice(event=>{
    if(event.type==='state'){$('#voice-state').textContent=event.status;verified=event.verified;audio.setVerified(verified);}
    else if(event.type==='reset'){verified=false;audio.setVerified(false);audio.positions=[];}
    else if(event.type==='signal')audio.receive(event.peer,event.payload);
    else if(event.type==='positions')audio.updatePositions(event.players);
    else if(event.type==='yaw'){audio.yaw=event.yaw;audio.updatePositions(audio.positions);}
    else if(event.type==='microsoft-code'){$('#voice-auth-code').value=event.code;$('#voice-auth').hidden=false;}
    else if(event.type==='account'){$('#voice-name').value=event.name;render();}
    else if(event.type==='verification-required'){
      $('#voice-verification').hidden=false;$('#voice-manual-code').hidden=verificationMode==='bridge';$('#voice-command').value='/vcmc:verify "'+event.value+'"';
      $('#voice-verification-title').textContent=verificationMode==='bridge'?'Verificación automática — en pruebas':'Verificación inicial';
      $('#voice-verification-help').textContent=verificationMode==='bridge'?'El puente enviará el código cuando Minecraft termine de entrar.':'Copia este comando en el chat de Minecraft una sola vez. El addon comprueba que controlas al jugador de tu cuenta Microsoft.';
      $('#voice-state').textContent=verificationMode==='bridge'?'Esperando al puente de Minecraft…':'Copia tu comando inicial en Minecraft';
    }
    else if(event.type==='automatic-verification-sent')$('#voice-state').textContent='Verificación enviada. Esperando confirmación del servidor…';
    else if(event.type==='verified'){$('#voice-verification').hidden=true;verified=true;audio.setVerified(true);}
    else if(event.type==='forced-mute')audio.setControls({forcedMute:event.value});
    else if(event.type==='forced-deafen')audio.setControls({forcedDeafen:event.value});
    else if(event.type==='self-mute')audio.setControls({muted:event.value});
    else if(event.type==='self-deafen')audio.setControls({deafened:event.value});
    else if(event.type==='settings'||event.type==='policy'){
      const v=event.value;if(Number.isFinite(v.audioRadius))audio.radius=Math.max(1,Math.min(256,v.audioRadius));if(Number.isFinite(v.spatialIntensity))audio.intensity=Math.max(0,Math.min(1,v.spatialIntensity));if(v.monoAudio===true)audio.intensity=0;audio.updatePositions(audio.positions);
    }else if(event.type==='peer-left')audio.remove(event.value.toLowerCase());
    else if(event.type==='notice')warning(event.value);
    else if(event.type==='warning')warning(event.message);
    else if(event.type==='server-error'){const message=event.value;leave().then(()=>warning('VCMC rechazó la conexión: '+message));}
    else if(event.type==='unsupported'&&[22,23,32,39,40].includes(event.opcode)&&!shownWarning){shownWarning=true;warning('La sala pidió una función avanzada que esta integración aún no reproduce.');}
    render();
  });
  window.fonyxVoice={leave,configure(settings){inputId=settings.voiceInput||'';outputId=settings.voiceOutput||'';verificationMode=settings.voiceVerification||'direct';micMode=settings.voiceMicMode||'open';audio.setControls({pushToTalk:micMode==='pushToTalk',pttHeld:false});$('#voice-verification-mode').value=verificationMode;},async play(options){if((active||connecting)&&audio.eventId!==options.eventId){await leave();$('#voice-room').value=options.room||'';}this.show(options);return connect({preventDefault(){}});},show(options){$('#voice-event').textContent=options.eventName;if(!active&&!connecting){if(eventId&&eventId!==options.eventId)$('#voice-room').value='';else if(!$('#voice-room').value)$('#voice-room').value=options.room||'';}eventId=options.eventId;render();}};
  window.addEventListener('beforeunload',()=>{audio.stop();});
})();
