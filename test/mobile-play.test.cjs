const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const {EventEmitter}=require('node:events');
function fixture({voiceEnabled=true,identity={name:'Rex',xuid:'123'},connectError=false,openError=false}={}){
 const initial=require('../packages/ui/initial-state'),content=JSON.parse(JSON.stringify(initial.initialState.content));content.events[0].voiceEnabled=voiceEnabled;
 const calls=[],module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/platform-api.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:name=>{
  if(name==='./voice-runtime')return {voiceState:()=>({}),voiceEvents:new EventEmitter(),connectVoice:async()=>{calls.push('voice');if(connectError)throw new Error('connecting');},disconnectVoice:async()=>calls.push('disconnect')};
  if(name==='./account')return {account:{identity}};
  if(name==='react-native')return {NativeModules:{},Linking:{openURL:async uri=>{calls.push(uri);if(openError)throw new Error('no Minecraft');}}};
  if(name==='../../packages/ui/initial-state')return {...initial,initialState:{...initial.initialState,content}};
  if(name==='../../packages/core/content')return require('../packages/core/content');
  if(name==='./content-source')return {};
  throw new Error(name);
 }});
 return {api:module.exports.api,calls};
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
