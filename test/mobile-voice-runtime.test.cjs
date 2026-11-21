const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
test('Android uses the Minecraft URI observed in the real VCMC APK and retains host validation',()=>{
 const {androidConnectUri,connectUri}=require('../packages/core/content');
 assert.equal(androidConnectUri('example.org',19132),'minecraft://connect/?serverUrl=example.org&serverPort=19132');
 assert.equal(connectUri('example.org',19132),'minecraft://connect?serverUrl=example.org&serverPort=19132');
 assert.throws(()=>androidConnectUri('evil/?serverPort=1',19132));assert.throws(()=>androidConnectUri('example.org',0));
});
function fixture(permission){
 const events=new EventEmitter(),relays=[],audios=[],calls=[];let task;
 class Relay extends EventEmitter{
  constructor(){super();this.status='Desconectado';this.verified=false;relays.push(this);}
  snapshot(){return {connected:this.connected,verified:this.verified};}
  async connectReady(){this.connected=true;this.status='Verifica tu cuenta en Minecraft';this.emit('event',{type:'verification-required',value:'test-code'});}
  disconnect(){this.connected=false;calls.push('relay-stop');}
  controls(value){Object.assign(this,value);} level(){} signal(){}
 }
 class Audio{
  constructor(options){this.options=options;this.peers=new Map();audios.push(this);}
  setControls(values){Object.assign(this,values);}
  setVerified(value){this.verified=value;}
  canTransmit(){return this.verified&&!this.muted;}
  async start(){calls.push('capture');}async stop(){calls.push('capture-stop');}
 }
 const native={copyCode:async command=>calls.push(command),update(){},stop:async()=>{calls.push('service-stop');events.emit('FonyxVoiceEvent',{type:'service-stopped'});},start:async()=>calls.push('service-start'),overlayPermission:async()=>true,deviceToken:async()=> 'a'.repeat(32)};
 const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/voice-runtime.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:name=>{
  if(name==='react-native')return {NativeModules:{FonyxVoice:native},NativeEventEmitter:class{addListener(name,fn){events.on(name,fn);return {remove:()=>events.off(name,fn)};}},AppRegistry:{registerHeadlessTask:(_name,fn)=>task=fn},Platform:{Version:35},PermissionsAndroid:{PERMISSIONS:{RECORD_AUDIO:'mic',POST_NOTIFICATIONS:'notification',BLUETOOTH_CONNECT:'bt'},RESULTS:{GRANTED:'granted'},requestMultiple:permission||async function(){return {mic:'granted'};}}};
  if(name==='./relay')return {createRelay:()=>new Relay()};
  if(name==='./native-audio')return {MobileVoiceAudio:Audio};
  return require(name);
 }});
 return {api:module.exports,events,relays,audios,calls,headless:()=>task()()};
}
const identity={name:'Rex',xuid:'123'},event={id:'jugo'};
test('mobile voice uses initial addon command, gates verification and cleans up background task',async()=>{
 const f=fixture();await f.api.connectVoice(identity,event,{});
 assert.deepEqual(f.calls.slice(0,3),['service-stop','service-start','capture']);
 assert.equal(f.api.voiceState().command,'/vcmc:verify "test-code"');
 await f.api.copyVoiceCode();assert.equal(f.calls.at(-1),'/vcmc:verify "test-code"');
 assert.equal(f.audios[0].verified,false);
 const background=f.headless();f.relays[0].verified=true;f.relays[0].emit('event',{type:'verified'});
 assert.equal(f.audios[0].verified,true);assert.equal(f.api.voiceState().command,'');
 await assert.rejects(f.api.copyVoiceCode(),/vigente/);
 f.relays[0].emit('event',{type:'verification-required',value:'replacement'});assert.equal(f.audios[0].verified,false);
 f.relays[0].emit('event',{type:'reset'});assert.equal(f.api.voiceState().command,'');
 f.events.emit('FonyxVoiceEvent',{type:'ptt',value:true});assert.equal(f.audios[0].pttHeld,true);
 f.events.emit('FonyxVoiceEvent',{type:'focus',value:true});assert.equal(f.audios[0].pttHeld,false);
 f.events.emit('FonyxVoiceEvent',{type:'ptt',value:false});assert.equal(f.audios[0].pttHeld,false);
 f.events.emit('FonyxVoiceEvent',{type:'volume',value:.3});assert.equal(f.audios[0].volume,.3);
 assert.throws(()=>f.api.voiceControls({verified:true}));
 await f.api.disconnectVoice();await background;assert.equal(f.api.voiceState().status,'Desconectado');
 assert.deepEqual(f.calls.slice(-3),['relay-stop','capture-stop','service-stop']);
});
test('cancelling while permission dialog is open never starts microphone or foreground service',async()=>{
 let grant;const f=fixture(()=>new Promise(resolve=>grant=resolve));
 const connecting=f.api.connectVoice(identity,event,{});await new Promise(resolve=>setImmediate(resolve));
 await f.api.disconnectVoice();grant({mic:'granted'});await assert.rejects(connecting,/cancelada/);
 assert.equal(f.calls.includes('capture'),false);assert.equal(f.calls.includes('service-start'),false);
});
test('double Play rejects duplicate connection and denied microphone stops setup',async()=>{
 let grant;const f=fixture(()=>new Promise(resolve=>grant=resolve));
 const first=f.api.connectVoice(identity,event,{});
 await assert.rejects(f.api.connectVoice(identity,event,{}),/momento/);
 await new Promise(resolve=>setImmediate(resolve));grant({mic:'denied'});
 await assert.rejects(first,/micrófono/);assert.equal(f.calls.includes('service-start'),false);
});
test('native microphone service is stopped even when JS audio teardown fails',async()=>{
 const f=fixture();await f.api.connectVoice(identity,event,{});
 f.audios[0].stop=async()=>{throw new Error('track cleanup');};
 await assert.rejects(f.api.disconnectVoice(),/track cleanup/);assert.equal(f.calls.at(-1),'service-stop');
});
