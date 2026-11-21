const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const {ProxyEngine}=require('./proxy-engine');
const {fetchJson}=require('../core');
const ENGINE_SHA256='30d78b089122ad412fdfcf02cff503230db14cc303874d06ba61bf31fd6a63bd';
const ISSUER='https://authorization.franchise.minecraft-services.net/';
const normalize=name=>name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();

// Contracts observed in the Windows transport and identity prover. Tokens stay in the main process.
function verifyIdentity(proof,nonce,keys,now=Date.now()){
  if(typeof proof?.token!=='string'||typeof proof.signature!=='string')throw new Error('Microsoft no confirmó la identidad.');
  const token=proof.token.replace(/^MCToken\s+/i,''),parts=token.split('.');
  if(parts.length!==3)throw new Error('Prueba de Microsoft inválida.');
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  const key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(header.alg!=='RS256'||!key||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Firma de Microsoft inválida.');
  if(claims.iss!==ISSUER||claims.aud!=='api://auth-minecraft-services/multiplayer'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now+30000)))throw new Error('La autorización de Minecraft caducó o no corresponde a este servicio.');
  if(typeof claims.xname!=='string'||!normalize(claims.xname)||claims.xname.length>40||typeof claims.xid!=='string'||!/^\d{1,20}$/.test(claims.xid)||claims.xid==='0'||typeof claims.cpk!=='string')throw new Error('La autorización no identifica una cuenta de Xbox.');
  const publicKey=crypto.createPublicKey({key:Buffer.from(claims.cpk,'base64'),format:'der',type:'spki'});
  if(publicKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyDetails.namedCurve!=='secp384r1'||!crypto.verify('sha384',Buffer.from('vcmc-identity-v1:'+nonce),publicKey,Buffer.from(proof.signature,'base64')))throw new Error('La prueba no pertenece a esta sesión.');
  return {name:claims.xname,xuid:claims.xid};
}
async function identityKeys(){
  const config=await fetchJson(ISSUER+'.well-known/openid-configuration');
  const url=new URL(config.jwks_uri);
  if(config.issuer!==ISSUER||url.origin!==new URL(ISSUER).origin||url.username||url.password)throw new Error('Servicio de identidad de Minecraft inválido.');
  const result=await fetchJson(url.href);
  if(!Array.isArray(result.keys)||!result.keys.length)throw new Error('Microsoft no entregó sus claves de verificación.');
  return result.keys;
}
class AddonBridge extends EventEmitter{
  constructor({executable,cacheDir,engine,loadKeys=identityKeys}){
    super();this.executable=executable;this.engine=engine||new ProxyEngine({executable,cacheDir});this.loadKeys=loadKeys;this.identity=null;this.target='';this.connected=false;this.code='';this.sending=false;this.timer=null;this.generation=0;
    this.engine.on('engine-event',event=>this.receive(event));
    this.engine.on('fault',message=>this.emit('event',{type:'warning',message}));
    this.engine.on('stopped',()=>{this.connected=false;this.target='';this.identity=null;this.cancelVerification();this.emit('event',{type:'account',name:'',connected:false});});
    this.checkExecutable=!engine;
  }
  async login(){
    if(this.loginPromise)return this.loginPromise;
    this.loginPromise=this.authenticate().finally(()=>{this.loginPromise=null;});return this.loginPromise;
  }
  async authenticate(){
    const generation=this.generation;
    if(this.checkExecutable){const hash=crypto.createHash('sha256').update(await fs.readFile(this.executable)).digest('hex');if(hash!==ENGINE_SHA256)throw new Error('El motor de conexión no corresponde a la versión comprobada de VCMC.');}
    await this.engine.start();
    const nonce=crypto.randomBytes(24).toString('base64url');let proof;
    try{proof=await this.engine.request('identity_proof',{payload:nonce},900000);}
    catch(error){
      if(error.code!=='VOICE_ENGINE_REQUEST_FAILED'||error.command!=='identity_proof'||generation!==this.generation)throw error;
      const session=await this.engine.request('ping');
      if(!session?.savedSignIn||generation!==this.generation)throw error;
      this.emit('event',{type:'account-retry'});
      proof=await this.engine.request('identity_proof',{payload:nonce},900000);
    }
    const identity=verifyIdentity(proof,nonce,await this.loadKeys());
    if(generation!==this.generation)throw new Error('Conexión cancelada.');
    this.identity=identity;this.emit('event',{type:'account',name:identity.name,connected:true});return {name:identity.name};
  }
  async start(host,port){
    if(!this.identity)throw new Error('Conecta tu cuenta Microsoft primero.');
    this.cancelVerification();this.connected=false;this.playerAuthenticated=false;
    this.target=(host.includes(':')?'['+host+']':host)+':'+port;
    const result=await this.engine.request('start_server_proxy',{address:this.target,port:19189},30000);
    if(!Number.isInteger(result?.port)||result.port<1||result.port>65535)throw new Error('El puente local no entregó un puerto válido.');
    this.destination={host:'127.0.0.1',port:result.port};return this.destination;
  }
  matches(host,port){return this.connected&&this.target===(host.includes(':')?'['+host+']':host)+':'+port;}
  receive(event){
    if(event.event==='auth_code'){
      if(typeof event.userCode==='string'&&/^[A-Z0-9-]{4,24}$/i.test(event.userCode))this.emit('event',{type:'microsoft-code',code:event.userCode});
    }else if(event.event==='minecraft_authenticated'){
      this.playerAuthenticated=!!this.identity&&event.xuid===this.identity.xuid;
      if(!this.playerAuthenticated){this.connected=false;this.engine.request('stop_proxy').catch(()=>{});this.emit('event',{type:'warning',message:'La cuenta de Minecraft no coincide con la cuenta Microsoft conectada.'});}
    }else if(event.event==='server_connected'){
      if(!this.playerAuthenticated||!this.identity||typeof event.gamertag!=='string'||normalize(event.gamertag)!==normalize(this.identity.name)){this.connected=false;this.engine.request('stop_proxy').catch(()=>{});this.emit('event',{type:'warning',message:'El servidor confirmó otra cuenta. Se canceló la verificación.'});return;}
      this.connected=true;this.flush();
    }else if(['minecraft_disconnected','proxy_stopped'].includes(event.event)){this.connected=false;this.playerAuthenticated=false;}
    else if(event.event==='proxy_error')this.emit('event',{type:'warning',message:'No se pudo conectar Minecraft por el puente de voz. Comprueba el servidor y la versión del juego.'});
  }
  verify(code){
    if(typeof code!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(code))throw new Error('Código de voz inválido.');
    this.code=code;this.deadline=Date.now()+60000;this.flush();
  }
  async flush(){
    if(!this.connected||!this.code||this.sending)return;
    const code=this.code,generation=this.generation;this.sending=true;
    try{
      const result=await this.engine.request('send_command',{payload:'/vcmc:verify "'+code+'"'});
      if(generation!==this.generation||this.code!==code)return;
      if(result?.sent===true){this.code='';this.emit('event',{type:'automatic-verification-sent'});}
      else if(Date.now()<this.deadline){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),500);}
      else{this.code='';this.emit('event',{type:'warning',message:'Minecraft no aceptó la verificación automática. Vuelve a conectar la voz.'});}
    }catch{if(generation===this.generation)this.emit('event',{type:'warning',message:'No se pudo enviar la verificación automática a Minecraft.'});}
    finally{this.sending=false;if(this.code&&this.code!==code)this.flush();}
  }
  cancelVerification(){++this.generation;clearTimeout(this.timer);this.code='';}
  async close(){this.cancelVerification();await this.engine.close();}
  async signOut(){this.cancelVerification();await this.engine.request('sign_out');this.identity=null;this.connected=false;this.target='';this.emit('event',{type:'account',name:'',connected:false});}
}
module.exports={AddonBridge,verifyIdentity,identityKeys,ENGINE_SHA256};
