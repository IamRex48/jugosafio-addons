import {mediaDevices,RTCPeerConnection,MediaStream} from 'react-native-webrtc';
import {NativeModules} from 'react-native';
const {NativeVoiceAudio}=require('../../packages/core/voice-audio');

export class MobileVoiceAudio extends NativeVoiceAudio{
 constructor(options){super({...options,media:mediaDevices,Peer:RTCPeerConnection,Stream:MediaStream,uuid:()=>NativeModules.FonyxCrypto.randomNonce()});}
 async start({name,inputId=''}){
  await this.stop();const generation=++this.generation;this.name=name;this.active=true;
  try{
   const stream=await this.media.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(inputId?{deviceId:{exact:inputId}}:{})}});
   if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());stream.release?.();return;}
   this.stream=stream;this.applyControls();await NativeModules.FonyxVoice.track(stream.getAudioTracks()[0].id,stream.id);
   this.meterTimer=setInterval(()=>this.measureLevel(generation),200);this.onChange();
  }catch(error){await this.stop();throw error;}
 }
 async measureLevel(generation){
  let level=0;
  try{const peer=this.peers.values().next().value;if(this.canTransmit()&&peer){const stats=await peer.sender.getStats();for(const entry of stats.values())if(entry.type==='media-source'&&entry.kind==='audio'&&Number.isFinite(entry.audioLevel))level=Math.min(100,Math.round(entry.audioLevel*300));}}catch{}
  if(generation===this.generation&&this.active)this.onLevel(this.canTransmit()?level:0);
 }
 applyControls(){if(this.stream)for(const track of this.stream.getAudioTracks())track.enabled=this.canTransmit();for(const peer of this.peers.values())this.applySpatial(peer,peer.spatial);this.onChange();}
 attachRemote(peer,stream){peer.remoteTrack=stream.getAudioTracks()[0];this.applySpatial(peer,peer.spatial);this.onChange();}
 // shortcut: Android applies distance gain; implement and calibrate a native stereo mixer before claiming pan parity.
 applySpatial(peer,position){if(peer.remoteTrack){peer.remoteTrack.enabled=!this.deafened&&!this.forcedDeafen;peer.remoteTrack._setVolume(this.verified&&!this.deafened&&!this.forcedDeafen?Math.max(0,Math.min(1,this.volume*position.gain)):0);}}
 async setOutput(id=''){if(id)throw new Error('Elige Predeterminado del sistema para la salida de audio.');}
 async setInput(id=''){if(id)throw new Error('Selecciona el micrófono antes de conectar la voz.');}
 async stop(){const stream=this.stream;try{await super.stop();}finally{stream?.release?.();}}
}
