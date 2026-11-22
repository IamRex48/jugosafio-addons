const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const {EventEmitter}=require('node:events');
function fixture({voiceEnabled=true,identity={name:'Rex',xuid:'123'},connectError=false,openError=false,savedSettings={},restoreError=false}={}){
 const initial=require('../packages/ui/initial-state'),content=JSON.parse(JSON.stringify(initial.initialState.content));content.events[0].voiceEnabled=voiceEnabled;
 const calls=[],saved=[],voiceEvents=new EventEmitter(),module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/platform-api.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:name=>{
  if(name==='./voice-runtime')return {voiceState:()=>({}),voiceEvents,connectVoice:async()=>{calls.push('voice');if(connectError)throw new Error('connecting');},disconnectVoice:async()=>calls.push('disconnect')};
  if(name==='./account')return {account:{identity},restoreAccount:async()=>{calls.push('restore');if(restoreError)throw new Error('expired session');}};
  if(name==='react-native')return {NativeModules:{FonyxPlatform:{settings:async()=>JSON.stringify(savedSettings),saveSettings:async value=>{savedSettings=JSON.parse(value);saved.push(savedSettings);}}},Linking:{openURL:async uri=>{calls.push(uri);if(openError)throw new Error('no Minecraft');}}};
  if(name==='../../packages/ui/initial-state')return {...initial,initialState:{...initial.initialState,content}};
  if(name==='../../packages/core/content')return require('../packages/core/content');
  if(name==='./content-source')return {};
  throw new Error(name);
 }});
 return {api:module.exports.api,calls,saved,voiceEvents};
}
test('normal Play connects mandatory event voice before opening the Android Minecraft URI',async()=>{
 const f=fixture();await f.api.play('jugosafio');assert.equal(f.calls[0],'voice');assert.match(f.calls[1],/^minecraft:\/\/connect\/\?/);
 const noVoice=fixture({voiceEnabled:false});await noVoice.api.play('jugosafio');assert.equal(noVoice.calls[0],'disconnect');assert.match(noVoice.calls[1],/^minecraft:/);
 await assert.rejects(noVoice.api.voiceConnect({eventId:'jugosafio'}),/activado/);
});
test('Play requires own Microsoft identity and never opens Minecraft after failed voice setup',async()=>{
 const signedOut=fixture({identity:null});await assert.rejects(signedOut.api.play('jugosafio'),/Microsoft/);assert.deepEqual(signedOut.calls,[]);
 const connecting=fixture({connectError:true});await assert.rejects(connecting.api.play('jugosafio'),/connecting/);assert.deepEqual(connecting.calls,['voice']);
 const missingGame=fixture({openError:true});await assert.rejects(missingGame.api.play('jugosafio'),/Minecraft/);assert.equal(missingGame.calls.at(-1),'disconnect');
});

test('PTT selected from the bubble persists through the native settings boundary',async()=>{
 const f=fixture();f.voiceEvents.emit('event',{type:'microphone-mode',value:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saved.at(-1).voiceMicMode,'pushToTalk');
 f.voiceEvents.emit('event',{type:'microphone-mode',value:false});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saved.at(-1).voiceMicMode,'open');
});

test('first setup requires Microsoft, persists completion and restores it on subsequent startup',async()=>{
 const fresh=fixture({identity:null});const first=(await fresh.api.initialize()).value;
 assert.equal(first.account.connected,false);assert.notEqual(first.settings.setupComplete,true);
 await assert.rejects(fresh.api.finishSetup(),/Microsoft/);assert.equal(fresh.saved.length,0);
 const signedIn=fixture();const done=(await signedIn.api.finishSetup()).value;assert.equal(done.settings.setupComplete,true);
 const reopened=fixture({savedSettings:signedIn.saved[0]});const next=(await reopened.api.initialize()).value;
 assert.equal(next.settings.setupComplete,true);assert.equal(next.account.connected,true);assert.deepEqual(reopened.calls,['restore']);
 const expired=fixture({identity:null,savedSettings:{setupComplete:true},restoreError:true});const retry=(await expired.api.initialize()).value;
 assert.equal(retry.settings.setupComplete,true);assert.equal(retry.account.connected,false);assert.equal(retry.startupError,'expired session');
});
