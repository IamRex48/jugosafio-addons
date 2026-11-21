const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {platformFetch}=require('./network');
const {atomicJson}=require('./core');
function endpoint(value){
  if(!value)return '';
  if(typeof value!=='string')throw new Error('Enlace del banco inválido.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('El banco necesita un origen HTTPS propio, sin rutas ni credenciales.');
  return url.origin;
}
const proofNonce=(origin,challenge)=>crypto.createHash('sha256').update('fonyx-bank-v1|'+origin+'|'+challenge).digest('base64url');
function record(value){
  if(!value||!Number.isSafeInteger(value.balance)||value.balance<0||typeof value.soul!=='boolean'||!Number.isSafeInteger(value.recordedAt)||value.recordedAt<=0||value.recordedAt>Date.now()+30000)throw new Error('Registro del banco inválido.');
  return {balance:value.balance,soul:value.soul,recordedAt:value.recordedAt};
}
async function json(url,options={}){
  const response=await platformFetch(url,{...options,signal:AbortSignal.timeout(8000)});
  if(!response.ok){await response.body.cancel();const error=new Error('El banco no está disponible.');error.status=response.status;throw error;}
  const reader=response.body.getReader();let data='',bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;if((bytes+=value.length)>16384)throw new Error('Respuesta del banco demasiado grande.');data+=Buffer.from(value).toString('utf8');}}finally{await reader.cancel();}
  return JSON.parse(data);
}
class BankClient{
  constructor({directory,bridge,request=json}){Object.assign(this,{directory,bridge,request});this.session=null;this.pending=null;}
  async read(origin){
    origin=endpoint(origin);const identity=this.bridge.identity;
    if(!identity)return {record:null,status:'Conecta tu cuenta Microsoft'};
    const key=crypto.createHash('sha256').update(origin+'|'+identity.xuid).digest('hex'),file=path.join(this.directory,key+'.json');
    let cached=null;try{cached=record(JSON.parse(await fs.readFile(file,'utf8')));}catch{}
    if(!origin)return {record:cached,status:'Banco pendiente de conexión'};
    try{
      if(!this.session||this.session.key!==key||this.session.expiresAt<Date.now()){
        const {challenge}=await this.request(origin+'/challenge');
        if(typeof challenge!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(challenge))throw new Error('Desafío del banco inválido.');
        const proof=await this.bridge.engine.request('identity_proof',{payload:proofNonce(origin,challenge)},900000);
        if(this.bridge.identity?.xuid!==identity.xuid)throw new Error('La cuenta cambió.');
        const result=await this.request(origin+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,proof})});
        if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token)||result.xuid!==identity.xuid)throw new Error('Sesión del banco inválida.');
        this.session={key,token:result.token,expiresAt:Date.now()+50*60000};
      }
      const current=record(await this.request(origin+'/me',{headers:{Authorization:'Bearer '+this.session.token}}));
      if(this.bridge.identity?.xuid!==identity.xuid)throw new Error('La cuenta cambió.');
      if(cached&&current.recordedAt<cached.recordedAt)throw new Error('El banco devolvió un registro anterior.');
      await atomicJson(file,current);
      return {record:current,status:'Último registro del servidor'};
    }catch(error){if(error.status===401)this.session=null;return {record:cached,status:cached?'Último registro guardado · sin conexión':'Sin registro del servidor'};}
  }
  refresh(origin){if(!this.pending)this.pending=this.read(origin).finally(()=>{this.pending=null;});return this.pending;}
}
module.exports={BankClient,endpoint,proofNonce,record};
