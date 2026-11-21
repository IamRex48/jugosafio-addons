const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NativeVoiceAudio,spatial}=require('../src/renderer/voice-audio');
function node(){return {gain:{value:1,setTargetAtTime(v){this.value=v;}},pan:{value:0,setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){},getByteTimeDomainData(a){a.fill(128);}};}
class Context{currentTime=0;destination=node();createGain=node;createStereoPanner=node;createAnalyser=node;createMediaStreamSource=node;async resume(){}async close(){this.closed=true;}}
class Peer{connectionState='new';signalingState='stable';remoteDescription=null;localDescription=null;added=[];addTrack(track){this.track=track;return {replaceTrack:async value=>{this.track=value;}};}createDataChannel(){return {close(){},readyState:'connecting'};}async setLocalDescription(){const type=this.remoteDescription?.type==='offer'?'answer':'offer';this.localDescription={type,sdp:'test',toJSON(){return {type:this.type,sdp:this.sdp};}};this.signalingState=type==='offer'?'have-local-offer':'stable';}async setRemoteDescription(v){this.remoteDescription=v;this.signalingState=v.type==='offer'?'have-remote-offer':'stable';}async addIceCandidate(v){this.added.push(v);}close(){this.connectionState='closed';}}
test('atenuación, dimensión y orientación de Minecraft producen ganancia y paneo',()=>{
  const a={x:0,y:0,z:0,dimension:0};assert.equal(spatial(a,{...a,x:15},0,15).gain,0);assert.equal(spatial(a,{...a,dimension:1}).gain,0);assert.equal(spatial(a,{...a,x:1},0,15,1).pan,-1);assert.equal(spatial(a,{...a,x:-1},0,15,1).pan,1);
});

test('salida de audio elegida y predeterminada se aplican al mezclador; fallos no dejan el micrófono abierto',async()=>{
  const sinks=[];class OutputContext extends Context{async setSinkId(id){if(id==='missing')throw new Error('Salida ausente');sinks.push(id);}}
  const tracks=[],audio=new NativeVoiceAudio({Peer,Context:OutputContext,media:{async getUserMedia(){const track={enabled:true,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};}},sendSignal:async()=>{}});
  try{await audio.start({name:'uno',outputId:'headset'});await audio.setOutput('');assert.deepEqual(sinks,['headset','']);await audio.stop();await assert.rejects(audio.start({name:'uno',outputId:'missing'}),/ausente/);assert.equal(tracks.at(-1).stopped,true);assert.equal(audio.active,false);}finally{await audio.stop();}
});
test('cambio de micrófono fallido restaura todos los emisores y conserva el anterior',async()=>{
  const oldTrack={enabled:true,stop(){this.stopped=true;}},newTrack={enabled:true,stop(){this.stopped=true;}},stream=track=>({getTracks:()=>[track],getAudioTracks:()=>[track]});let requests=0;
  const audio=new NativeVoiceAudio({Peer,Context,media:{getUserMedia:async()=>stream(requests++?newTrack:oldTrack)},sendSignal:async()=>{}});
  try{
    await audio.start({name:'uno'});audio.setVerified(true);
    let restored=false;audio.peers.set('dos',{sender:{async replaceTrack(track){if(track===newTrack)throw new Error('device lost');restored=track===oldTrack;}},pc:{close(){}}});
    await assert.rejects(audio.setInput('new'));assert.equal(audio.stream.getAudioTracks()[0],oldTrack);assert.equal(oldTrack.stopped,undefined);assert.equal(newTrack.stopped,true);assert.equal(restored,true);
  }finally{await audio.stop();}
});

test('volver al micrófono predeterminado no exige un dispositivo con ID vacío',async()=>{
  const requests=[],tracks=[],audio=new NativeVoiceAudio({Peer,Context,media:{async getUserMedia(options){requests.push(options);const track={enabled:true,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};}},sendSignal:async()=>{}});
  try{
    await audio.start({name:'uno',inputId:'usb'});audio.setVerified(true);
    await audio.setInput('');assert.equal(requests[0].audio.deviceId.exact,'usb');assert.equal(requests[1].audio.deviceId,undefined);assert.equal(tracks[0].stopped,true);assert.equal(audio.stream.getAudioTracks()[0],tracks[1]);assert.equal(tracks[1].enabled,true);
  }finally{await audio.stop();assert.equal(tracks[1].stopped,true);}
});
test('captura no se transmite antes de verificar; negocia y silencia sin perder controles forzados',async()=>{
  const track={enabled:true,stop(){this.stopped=true;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]},sent=[];
  const audio=new NativeVoiceAudio({Peer,Context,media:{getUserMedia:async()=>stream},sendSignal:async(name,payload)=>sent.push({name,payload})});
  try{
    await audio.start({name:'uno'});assert.equal(track.enabled,false);
    const players=[{name:'uno',x:0,y:0,z:0,dimension:0},{name:'dos',x:1,y:0,z:0,dimension:0}];audio.updatePositions(players);assert.equal(audio.peers.size,0);audio.setVerified(true);assert.equal(track.enabled,true);
    const peer=audio.peers.get('dos');await audio.receive('dos',{type:'offer',sdp:'test',negotiationId:'one'});assert.ok(sent.some(s=>s.payload.type==='answer'));
    audio.setControls({muted:true});assert.equal(track.enabled,false);audio.setControls({muted:false,forcedMute:true});assert.equal(track.enabled,false);
    audio.setControls({forcedMute:false,deafened:true});assert.equal(audio.master.gain.value,0);assert.equal(track.enabled,false);
    audio.updatePositions([{...players[0]},{...players[1],x:99}]);assert.equal(audio.peers.size,0);assert.equal(peer.pc.connectionState,'closed');
  }finally{await audio.stop();assert.equal(track.stopped,true);}
});
test('mantener para hablar no cambia el silencio y soltar o ensordecer corta la transmisión',async()=>{
  const track={enabled:true,stop(){}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const audio=new NativeVoiceAudio({Peer,Context,media:{getUserMedia:async()=>stream},sendSignal:async()=>{}});
  try{
    audio.setControls({pushToTalk:true,pttHeld:false});await audio.start({name:'uno'});audio.setVerified(true);assert.equal(track.enabled,false);
    audio.setControls({pttHeld:true});assert.equal(track.enabled,true);assert.equal(audio.muted,false);
    audio.setControls({muted:true});assert.equal(track.enabled,false);audio.setControls({muted:false});assert.equal(track.enabled,true);
    audio.setControls({deafened:true});assert.equal(track.enabled,false);audio.setControls({deafened:false});assert.equal(track.enabled,true);
    audio.setControls({pttHeld:false});assert.equal(track.enabled,false);assert.equal(audio.muted,false);
  }finally{await audio.stop();}
});
