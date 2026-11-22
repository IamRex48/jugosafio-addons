const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
function fixture(saved,proofError){
 const lifecycle=[],calls=[],events=[],module={exports:{}};
 const native={begin:async()=>lifecycle.push('begin'),end:async()=>lifecycle.push('end'),savedSignIn:async()=>saved,proof:async()=>{calls.push('proof');if(proofError)throw proofError;return '{}';},copyCode:async code=>calls.push(code)};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/account.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:name=>{
  if(name==='react-native')return {NativeModules:{FonyxAccount:native,FonyxCrypto:{randomNonce:()=> 'a'.repeat(32)}},NativeEventEmitter:class {addListener(){return {remove(){}};}}};
  if(name==='./identity-verifier')return {verifyAccountProof:async()=>({name:'Own account',xuid:'123'})};
  if(name==='../../packages/core/identity')return {identityKeys:async()=>[]};
  if(name==='../../packages/core/addon-bridge')return require('../packages/core/addon-bridge');
  if(name==='events')return require('node:events');
  throw new Error(name);
 }});
 module.exports.account.on('event',event=>events.push(event));
 return {...module.exports,calls,events,lifecycle};
}
test('fresh Android install never starts an unsolicited Microsoft login during restoration',async()=>{
 const f=fixture(false);await f.restoreAccount();assert.equal(f.account.identity,null);assert.deepEqual(f.calls,[]);
});
test('saved own session is verified before restoring an account and is not verified twice',async()=>{
 const f=fixture(true);await f.restoreAccount();assert.equal(f.account.identity.xuid,'123');
 assert.equal(f.events.at(-1).type,'account');await f.restoreAccount();assert.deepEqual(f.calls,['proof']);assert.deepEqual(f.lifecycle,['begin','end']);
});
test('post-login failure preserves its safe native stage and Microsoft code copies without login',async()=>{
 const f=fixture(false,{code:'IDENTITY_PROOF',message:'No se pudo completar la conexión con Xbox Live.'});
 await assert.rejects(f.account.login(),/Xbox Live/);
 await f.copyAccountCode('ABCD1234');assert.deepEqual(f.calls,['proof','ABCD1234']);
});

test('cancelled authentication releases its background service without retrying',async()=>{const f=fixture(true,{code:'IDENTITY_PROOF',message:'Conexión cancelada.'});await assert.rejects(f.account.login(),/cancelada/);assert.deepEqual(f.calls,['proof']);assert.deepEqual(f.lifecycle,['begin','end']);});
