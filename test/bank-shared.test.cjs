const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs');
const {BankClient}=require('../packages/core/bank');
const origin='https://bank.example',balance={balance:123,soul:false,recordedAt:Date.now()};
function setup(){
 const records=new Map(),calls=[],bridge={identity:{name:'Player One',xuid:'123'},engine:{request:async()=>({token:'fixture',signature:'fixture'})}};
 const cache={read:async(o,id)=>records.get(o+'|'+id),write:async(o,id,v)=>records.set(o+'|'+id,v)};
 const request=async(url,options)=>{calls.push({url,options});if(url.endsWith('/challenge'))return {challenge:'a'.repeat(32)};if(url.endsWith('/session'))return {token:'a'.repeat(64),xuid:bridge.identity.xuid};return balance;};
 const client=new BankClient({bridge,cache,request,deriveNonce:(o,c)=>crypto.createHash('sha256').update('fonyx-bank-v1|'+o+'|'+c).digest('base64url')});
 return {client,bridge,records,calls};
}
test('bank core authenticates once, scopes cache to xuid and returns records without credentials',async()=>{
 const {client,bridge,records,calls}=setup();
 assert.deepEqual(await client.refresh(origin),{record:balance,status:'Último registro del servidor'});
 await client.refresh(origin);assert.equal(calls.filter(c=>c.url.endsWith('/session')).length,1);
 assert.deepEqual(records.get(origin+'|123'),balance);
 bridge.identity={name:'Other',xuid:'456'};client.request=async()=>{throw new Error('offline');};
 assert.equal((await client.refresh(origin)).record,null);
});
test('account switch during identity proof cannot open a bank session',async()=>{
 const {client,bridge,calls}=setup();bridge.engine.request=async()=>{bridge.identity={xuid:'456'};return {};};
 assert.equal((await client.refresh(origin)).record,null);assert.equal(calls.some(c=>c.url.endsWith('/session')),false);
});
test('stale server records cannot replace newer cache, and 401 invalidates the session',async()=>{
 const {client,records}=setup();await client.refresh(origin);
 const newer={...balance,recordedAt:Date.now()+1000};records.set(origin+'|123',newer);
 assert.deepEqual((await client.refresh(origin)).record,newer);
 client.request=async()=>{const error=new Error('expired');error.status=401;throw error;};
 assert.deepEqual((await client.refresh(origin)).record,newer);assert.equal(client.session,null);
});
test('bank state machine has no Node dependency',()=>{
 const context={URL,module:{exports:{}}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../packages/core/bank'),'utf8'),context);
 assert.equal(context.module.exports.endpoint(origin+'/'),origin);assert.equal(vm.runInContext('typeof Buffer',context),'undefined');
});
