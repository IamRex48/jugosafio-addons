import {AppRegistry,NativeEventEmitter,NativeModules,PermissionsAndroid,Platform} from 'react-native';
import {createRelay} from './relay';
import {MobileVoiceAudio} from './native-audio';
const {EventEmitter}=require('events');
const native=NativeModules.FonyxVoice;
export const voiceEvents=new EventEmitter();
let relay=null,audio=null,starting=false,running=false,generation=0,command='',level=0,stopping=0;
const nativeEvents=new NativeEventEmitter(native);
export function voiceState(){return {...relay?.snapshot(),status:relay?.status||'Desconectado',microphoneActive:!!audio?.canTransmit(),pushToTalk:audio?.pushToTalk,command,peers:audio?[...audio.peers.keys()]:[]};}
export async function copyVoiceCode(){if(!command)throw new Error('No hay un código de verificación vigente.');return native.copyCode(command);}
function updateBubble(){native.update(!!audio?.muted||!!audio?.forcedMute,!!audio?.deafened||!!audio?.forcedDeafen,!!relay?.verified,level>5&&!!audio?.canTransmit(),!!audio?.pushToTalk);}
function changed(){updateBubble();voiceEvents.emit('event',{type:'voice-state',value:voiceState()});}
async function stopVoice(){++stopping;try{const oldRelay=relay,oldAudio=audio;relay=null;audio=null;running=false;command='';level=0;oldRelay?.removeAllListeners();oldRelay?.disconnect();try{await oldAudio?.stop();}finally{await native.stop();changed();}}finally{--stopping;}}
export async function disconnectVoice(){++generation;try{await stopVoice();}finally{starting=false;}}
export function voiceControls(values){
 if(!audio)return;
 for(const [key,value] of Object.entries(values))if(key==='volume'?!(Number.isFinite(value)&&value>=0&&value<=1):!['muted','deafened','pttHeld','pushToTalk'].includes(key)||typeof value!=='boolean')throw new Error('Controles de voz inválidos.');
 audio.setControls(values);relay?.controls({muted:audio.muted,deafened:audio.deafened});changed();
}
nativeEvents.addListener('FonyxVoiceEvent',event=>{
 if(event.type==='mute')voiceControls({muted:event.value});
 else if(event.type==='deafen')voiceControls({deafened:event.value});
 else if(event.type==='ptt')voiceControls({pttHeld:event.value});
 else if(event.type==='ptt-mode'&&audio){voiceControls({pushToTalk:event.value,pttHeld:false});voiceEvents.emit('event',{type:'microphone-mode',value:event.value});}
 else if(event.type==='volume')voiceControls({volume:event.value});
 else if(event.type==='copy-code')copyVoiceCode().catch(error=>voiceEvents.emit('event',{type:'warning',message:error.message}));
 else if(event.type==='disconnect'||event.type==='service-stopped'||event.type==='overlay-error'){
  if(event.type==='overlay-error')voiceEvents.emit('event',{type:'warning',message:'No se pudo abrir la burbuja de voz. Se desconectó el micrófono.'});
  if(!stopping&&(running||starting))disconnectVoice().catch(()=>{});
 }
});
AppRegistry.registerHeadlessTask('FonyxVoice',()=>()=>new Promise(resolve=>{
 if(!running&&!starting){resolve();return;}
 const subscription=nativeEvents.addListener('FonyxVoiceEvent',event=>{if(event.type==='service-stopped'){subscription.remove();resolve();}});
}));
export async function connectVoice(identity,event,settings){
 if(!identity?.name||!identity.xuid)throw new Error('Conecta tu cuenta Microsoft primero.');
 if(starting)throw new Error('Un momento…');
 const current=++generation;starting=true;
 try{
  await stopVoice();if(current!==generation)throw new Error('Conexión cancelada.');
  const permissions=[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if(Number(Platform.Version)>=33)permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  if(Number(Platform.Version)>=31)permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  const granted=await PermissionsAndroid.requestMultiple(permissions);
  if(current!==generation)throw new Error('Conexión cancelada.');
  if(granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('Permite el micrófono para conectar la voz.');
  if(!await native.overlayPermission())throw new Error('Activa la burbuja de Fonyx y vuelve a pulsar Jugar.');
  if(current!==generation)throw new Error('Conexión cancelada.');
  await native.start();
  const deviceToken=await native.deviceToken();if(current!==generation)throw new Error('Conexión cancelada.');
  relay=createRelay(deviceToken);
  audio=new MobileVoiceAudio({sendSignal:(peer,payload)=>relay.signal(peer,payload),onChange:()=>{},onLevel:value=>{level=value;relay?.level(value);updateBubble();},onWarning:message=>voiceEvents.emit('event',{type:'warning',message})});
  audio.setControls({pushToTalk:settings.voiceMicMode==='pushToTalk',pttHeld:false});
  relay.on('event',message=>{
   if(current!==generation)return;
   if(message.type==='verified'){command='';audio.setVerified(true);}
   else if(message.type==='reset'){command='';audio.setVerified(false);}
   else if(message.type==='positions')audio.updatePositions(message.players);
   else if(message.type==='yaw'){audio.yaw=message.yaw;audio.updatePositions(audio.positions);}
   else if(message.type==='signal')audio.receive(message.peer,message.payload).catch(()=>{});
   else if(message.type==='verification-required'){audio.setVerified(false);command='/vcmc:verify "'+message.value+'"';}
   else if(message.type==='peer-left')audio.remove(message.value.toLowerCase());
   else if(['forced-mute','forced-deafen','self-mute','self-deafen'].includes(message.type))audio.setControls({[{'forced-mute':'forcedMute','forced-deafen':'forcedDeafen','self-mute':'muted','self-deafen':'deafened'}[message.type]]:message.value});
   else if(message.type==='settings'||message.type==='policy'){if(Number.isFinite(message.value.audioRadius))audio.radius=Math.max(1,Math.min(256,message.value.audioRadius));audio.updatePositions(audio.positions);}
   else if(message.type==='server-error'){disconnectVoice().catch(()=>{});}
   changed();
  });
  await audio.start({name:identity.name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase()});
  if(current!==generation)throw new Error('Conexión cancelada.');
  await relay.connectReady({name:identity.name,room:settings.voiceRooms?.[event.id]||''});
  if(current!==generation)throw new Error('Conexión cancelada.');
  running=true;starting=false;changed();return voiceState();
 }catch(error){if(current===generation)await disconnectVoice();throw error;}
}
