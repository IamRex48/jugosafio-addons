const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {AddonBridge,verifyIdentity}=require('../src/voice/addon-bridge');
const signing=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),device=crypto.generateKeyPairSync('ec',{namedCurve:'secp384r1'});
const keys=[{...signing.publicKey.export({format:'jwk'}),kid:'microsoft-test',use:'sig'}];
function proof(nonce,overrides={}){
  const claims={iss:'https://authorization.franchise.minecraft-services.net/',aud:'api://auth-minecraft-services/multiplayer',exp:Date.now()/1000+3600,xname:'Player One',xid:'123456789',cpk:device.publicKey.export({format:'der',type:'spki'}).toString('base64'),...overrides};
  const encoded=[{alg:'RS256',kid:'microsoft-test'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return {token:encoded+'.'+crypto.sign('RSA-SHA256',Buffer.from(encoded),signing.privateKey).toString('base64url'),signature:crypto.sign('sha384',Buffer.from('vcmc-identity-v1:'+nonce),device.privateKey).toString('base64')};
}
class Engine extends EventEmitter{
  requests=[];
  async start(){}
  async close(){this.emit('stopped');}
  async request(command,parameters={}){
    this.requests.push({command,...parameters});
    if(command==='identity_proof')return proof(parameters.payload);
    if(command==='start_server_proxy')return {port:19189};
    return {sent:true};
  }
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('identidad verifica la firma de Microsoft y posesión de la clave para el desafío actual',()=>{
  const nonce='a'.repeat(32),valid=proof(nonce);
  assert.deepEqual(verifyIdentity(valid,nonce,keys),{name:'Player One',xuid:'123456789'});
  assert.throws(()=>verifyIdentity(valid,'b'.repeat(32),keys),/sesión/);
  assert.throws(()=>verifyIdentity(valid,nonce,[]),/Firma/);
  const parts=valid.token.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));claims.xname='Impostor';parts[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
  assert.throws(()=>verifyIdentity({...valid,token:parts.join('.')},nonce,keys),/Firma/);
  for(const overrides of [{exp:0},{aud:'otro-servicio'},{iss:'https://example.com/'},{nbf:Date.now()/1000+3600},{xid:'0'},{xid:''},{xname:''}])assert.throws(()=>verifyIdentity(proof(nonce,overrides),nonce,keys));
});

test('addon espera la cuenta real y el servidor antes de enviar automáticamente el código',async()=>{
  const engine=new Engine(),bridge=new AddonBridge({engine,loadKeys:async()=>keys}),events=[];bridge.on('event',event=>events.push(event));
  try{
    const account=await bridge.login();assert.deepEqual(account,{name:'Player One'});assert.equal(account.token,undefined);assert.equal(account.xuid,undefined);
    await bridge.start('example.com',19132);bridge.verify('CODE123');await settle();assert.equal(engine.requests.some(r=>r.command==='send_command'),false);
    engine.emit('engine-event',{event:'minecraft_authenticated',xuid:'123456789'});await settle();assert.equal(engine.requests.some(r=>r.command==='send_command'),false);
    engine.emit('engine-event',{event:'server_connected',gamertag:'Player One'});await settle();
    assert.equal(bridge.matches('example.com',19132),true);assert.equal(bridge.matches('other.example.com',19132),false);assert.equal(bridge.matches('example.com',19133),false);
    const sent=engine.requests.filter(r=>r.command==='send_command');assert.deepEqual(sent,[{command:'send_command',payload:'/vcmc:verify "CODE123"'}]);
    assert.ok(events.some(e=>e.type==='automatic-verification-sent'));assert.equal(events.some(e=>e.type==='verified'),false);
    assert.throws(()=>bridge.verify('CODE"\n/kill @a'),/inválido/);
  }finally{await bridge.close();assert.equal(bridge.matches('example.com',19132),false);}
});

test('otra cuenta o un nombre parecido nunca autorizan enviar la verificación',async()=>{
  for(const mismatch of ['xuid','gamertag','missing-auth']){
    const engine=new Engine(),bridge=new AddonBridge({engine,loadKeys:async()=>keys});
    try{
      await bridge.login();await bridge.start('example.com',19132);bridge.verify('CODE');
      if(mismatch!=='missing-auth')engine.emit('engine-event',{event:'minecraft_authenticated',xuid:mismatch==='xuid'?'999':'123456789'});
      engine.emit('engine-event',{event:'server_connected',gamertag:mismatch==='gamertag'?'Impostor':'Player One'});await settle();
      assert.equal(engine.requests.some(r=>r.command==='send_command'),false);assert.ok(engine.requests.some(r=>r.command==='stop_proxy'));
    }finally{await bridge.close();}
  }
});

test('cancelar un login pendiente no restaura la cuenta después del cierre',async()=>{
  const engine=new Engine(),bridge=new AddonBridge({engine,loadKeys:async()=>keys});let release;
  engine.request=async(command,parameters)=>new Promise(resolve=>{release=()=>resolve(proof(parameters.payload));});
  const login=bridge.login();await settle();await bridge.close();release();await assert.rejects(login,/cancelada/);assert.equal(bridge.identity,null);
});

test('si el primer proof falla con la sesión Microsoft ya guardada, lo completa sin otro login',async()=>{
  const engine=new Engine(),events=[];let attempts=0,payload;
  engine.request=async(command,parameters={})=>{
    if(command==='ping')return {savedSignIn:true};
    if(command==='identity_proof'){attempts++;if(attempts===1){payload=parameters.payload;const error=new Error('transporte');error.code='VOICE_ENGINE_REQUEST_FAILED';error.command='identity_proof';throw error;}assert.equal(parameters.payload,payload);return proof(payload);}
  };
  const bridge=new AddonBridge({engine,loadKeys:async()=>keys});bridge.on('event',event=>events.push(event));
  try{assert.deepEqual(await bridge.login(),{name:'Player One'});assert.equal(attempts,2);assert.ok(events.some(event=>event.type==='account-retry'));}finally{await bridge.close();}
});

test('no reintenta una firma inválida ni inicia otro login si no hay una sesión guardada',async()=>{
  for(const saved of [false,true]){
    const engine=new Engine();let attempts=0;
    engine.request=async(command,parameters={})=>{
      if(command==='ping')return {savedSignIn:false};
      if(command==='identity_proof'){attempts++;if(saved)return {...proof(parameters.payload),signature:Buffer.from('invalid').toString('base64')};const error=new Error('sin sesión');error.code='VOICE_ENGINE_REQUEST_FAILED';error.command='identity_proof';throw error;}
    };
    const bridge=new AddonBridge({engine,loadKeys:async()=>keys});try{await assert.rejects(bridge.login());assert.equal(attempts,1);assert.equal(bridge.identity,null);}finally{await bridge.close();}
  }
});
