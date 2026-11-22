const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
function fixture(saved){
 const calls=[],events=[],module={exports:{}};
 const native={savedSignIn:async()=>saved,proof:async()=>{calls.push('proof');return '{}';}};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/account.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:name=>{
  if(name==='react-native')return {NativeModules:{FonyxAccount:native,FonyxCrypto:{randomNonce:()=> 'a'.repeat(32)}},NativeEventEmitter:class {addListener(){return {remove(){}};}}};
  if(name==='./identity-verifier')return {verifyAccountProof:async()=>({name:'Own account',xuid:'123'})};
  if(name==='../../packages/core/identity')return {identityKeys:async()=>[]};
  if(name==='../../packages/core/addon-bridge')return require('../packages/core/addon-bridge');
  if(name==='events')return require('node:events');
  throw new Error(name);
 }});
 module.exports.account.on('event',event=>events.push(event));
 return {...module.exports,calls,events};
}
test('fresh Android install never starts an unsolicited Microsoft login during restoration',async()=>{
 const f=fixture(false);await f.restoreAccount();assert.equal(f.account.identity,null);assert.deepEqual(f.calls,[]);
});
test('saved own session is verified before restoring an account and is not verified twice',async()=>{
 const f=fixture(true);await f.restoreAccount();assert.equal(f.account.identity.xuid,'123');
 assert.equal(f.events.at(-1).type,'account');await f.restoreAccount();assert.deepEqual(f.calls,['proof']);
});
