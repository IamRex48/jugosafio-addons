const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {BankClient,endpoint,record}=require('../src/bank');
const {createBankServer}=require('../integration/bank-server.cjs');
const {platformFetch}=require('../src/network');
const core=require('../src/core');
test('enlaces del banco y registros rechazan HTTP, rutas y dinero inválido',()=>{
  assert.equal(endpoint('https://bank.example/'),'https://bank.example');
  for(const value of ['http://bank.example','https://bank.example/me','https://other@bank.example','https://bank.example/?x=1'])assert.throws(()=>endpoint(value));
  for(const balance of [-1,NaN,1.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>record({balance,soul:true,recordedAt:Date.now()}));
  const content=require('../launcher-content.json');const copy=structuredClone(content);copy.events[0].bankEndpoint='https://bank.example';
  assert.equal(core.validateContent(copy).events[0].bankEndpoint,'https://bank.example');copy.events[0].bankEndpoint='http://bank.example';assert.throws(()=>core.validateContent(copy));
});
test('banco completo: saldo auténtico de la cuenta, clave del servidor, prueba Microsoft, caché aislada y rechazo de replay',async()=>{
  const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),ec=crypto.generateKeyPairSync('ec',{namedCurve:'secp384r1'}),origin='https://bank.example';
  const keys=[{...rsa.publicKey.export({format:'jwk'}),kid:'test',use:'sig'}];
  function proof(nonce,name='Player One',xuid='123'){
    const claims={iss:'https://authorization.franchise.minecraft-services.net/',aud:'api://auth-minecraft-services/multiplayer',exp:Date.now()/1000+3600,xname:name,xid:xuid,cpk:ec.publicKey.export({format:'der',type:'spki'}).toString('base64')};
    const input=[{alg:'RS256',kid:'test'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return {token:input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),rsa.privateKey).toString('base64url'),signature:crypto.sign('sha384',Buffer.from('vcmc-identity-v1:'+nonce),ec.privateKey).toString('base64')};
  }
  let now=Date.now();const server=createBankServer({origin,secret:'s'.repeat(32),loadKeys:async()=>keys,now:()=>now});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(url,options){const response=await platformFetch(url.replace(origin,base),options),data=await new Response(response.body).json();if(!response.ok){const error=new Error('HTTP '+response.status);error.status=response.status;throw error;}return data;}
  async function ingest(secret,players){return request(origin+'/ingest',{method:'POST',headers:{'Content-Type':'application/json','x-fonyx-server-key':secret},body:JSON.stringify({players})});}
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fonyx-bank-test-'));
  const bridge={identity:{name:'Player One',xuid:'123'},engine:{request:async(_,value)=>proof(value.payload)}};
  try{
    await assert.rejects(ingest('wrong',[{name:'Player One',balance:999,soul:true}]),/401/);
    await ingest('s'.repeat(32),[{name:'Player One',balance:12345,soul:false},{name:'PlayerOne',balance:999999,soul:true}]);
    const client=new BankClient({directory,bridge,request});
    const result=await client.refresh(origin);assert.equal(result.record.balance,12345);assert.equal(result.record.soul,false);
    const cached=new BankClient({directory,bridge,request:async()=>{throw new Error('offline');}});
    assert.equal((await cached.refresh(origin)).record.balance,12345);
    bridge.identity={name:'Someone Else',xuid:'456'};assert.equal((await cached.refresh(origin)).record,null);bridge.identity={name:'Player One',xuid:'123'};
    const {challenge}=await request(origin+'/challenge');
    const wrong=proof('a different origin challenge');
    await assert.rejects(request(origin+'/session',{method:'POST',body:JSON.stringify({challenge,proof:wrong})}),/401/);
    await assert.rejects(request(origin+'/session',{method:'POST',body:JSON.stringify({challenge,proof:wrong})}),/401/);
    now+=91000;assert.equal((await client.refresh(origin)).record.balance,12345);assert.match((await client.refresh(origin)).status,/sin conexión/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
