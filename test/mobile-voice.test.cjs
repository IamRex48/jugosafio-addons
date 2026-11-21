const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {NativeVoiceAudio}=require('../packages/core/voice-audio');
function fixture(capture){
 const track={id:'mic',enabled:true,stopped:false,stop(){this.stopped=true;}};
 const stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
 const registered=[];
 const module={exports:{}};
 const code=transformSync(fs.readFileSync('apps/mobile/native-audio.js','utf8'),{format:'cjs'}).code;
 vm.runInNewContext(code,{module,exports:module.exports,setInterval,clearInterval,require:name=>{
  if(name==='react-native-webrtc')return {mediaDevices:{getUserMedia:capture||async function(){return stream;}}};
  if(name==='react-native')return {NativeModules:{FonyxCrypto:{randomNonce:()=> 'nonce'},FonyxVoice:{track:async id=>registered.push(id)}}};
  return {NativeVoiceAudio};
 }});
 return {audio:new module.exports.MobileVoiceAudio(),track,stream,registered};
}
test('Android microphone remains gated by verification, PTT and server mute',async()=>{
 const {audio,track,registered}=fixture();
 try{
  await audio.start({name:'rex'});assert.equal(track.enabled,false);assert.deepEqual(registered,['mic']);
  audio.setVerified(true);assert.equal(track.enabled,true);
  for(const control of ['muted','deafened','forcedMute','forcedDeafen']){
   audio.setControls({[control]:true});assert.equal(track.enabled,false,control);
   audio.setControls({[control]:false});assert.equal(track.enabled,true,control);
  }
  audio.setControls({pushToTalk:true});assert.equal(track.enabled,false);
  audio.setControls({pttHeld:true});assert.equal(track.enabled,true);
  audio.setControls({pttHeld:false});assert.equal(track.enabled,false);
  await audio.stop();assert.equal(track.stopped,true);assert.equal(audio.stream,null);
 }finally{await audio.stop();}
});
test('Android remote gain follows distance, verification and deafen',()=>{
 const {audio}=fixture();let volume;
 const remote={enabled:true,_setVolume:value=>volume=value};
 const peer={spatial:{gain:.4},remoteTrack:remote};audio.peers.set('other',peer);
 audio.applySpatial(peer,peer.spatial);assert.equal(volume,0);
 audio.verified=true;audio.setControls({volume:.5});assert.equal(volume,.2);
 audio.setControls({deafened:true});assert.equal(volume,0);assert.equal(remote.enabled,false);
 audio.setControls({deafened:false,forcedDeafen:true});assert.equal(volume,0);
 audio.setControls({forcedDeafen:false});assert.equal(volume,.2);assert.equal(remote.enabled,true);
});
test('Android cancellation discards late microphone capture without registering it',async()=>{
 let release;const {audio,registered}=fixture(()=>new Promise(resolve=>release=resolve));
 const pending=audio.start({name:'rex'});await new Promise(resolve=>setImmediate(resolve));
 await audio.stop();let stopped=false;release({getTracks:()=>[{stop(){stopped=true;}}]});
 await pending;assert.equal(stopped,true);assert.equal(audio.stream,null);assert.deepEqual(registered,[]);
});
test('Android speaking indicator reads real WebRTC levels and clears on mute',async()=>{
 const {audio}=fixture();const levels=[];audio.onLevel=value=>levels.push(value);
 try{
  await audio.start({name:'rex'});audio.verified=true;
  audio.peers.set('other',{sender:{getStats:async()=>new Map([['source',{type:'media-source',kind:'audio',audioLevel:.1}]])},pc:{close(){}}});
  await audio.measureLevel(audio.generation);assert.equal(levels.at(-1),30);
  audio.setControls({muted:true});await audio.measureLevel(audio.generation);assert.equal(levels.at(-1),0);
 }finally{await audio.stop();}
});
