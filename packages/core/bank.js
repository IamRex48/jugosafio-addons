function endpoint(value){
  if(!value)return '';
  if(typeof value!=='string')throw new Error('Enlace del banco inválido.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('El banco necesita un origen HTTPS propio, sin rutas ni credenciales.');
  return url.origin;
}
function record(value){
  if(!value||!Number.isSafeInteger(value.balance)||value.balance<0||typeof value.soul!=='boolean'||!Number.isSafeInteger(value.recordedAt)||value.recordedAt<=0||value.recordedAt>Date.now()+30000)throw new Error('Registro del banco inválido.');
  return {balance:value.balance,soul:value.soul,recordedAt:value.recordedAt};
}
class BankClient{
  constructor({bridge,request,cache,deriveNonce}){Object.assign(this,{bridge,request,cache,deriveNonce});this.session=null;this.pending=null;}
  async read(origin){
    origin=endpoint(origin);const identity=this.bridge.identity;
    if(!identity)return {record:null,status:'Conecta tu cuenta Microsoft'};
    const key=origin+'|'+identity.xuid;
    let cached=null;try{cached=record(await this.cache.read(origin,identity.xuid));}catch{}
    if(!origin)return {record:cached,status:'Banco pendiente de conexión'};
    try{
      if(!this.session||this.session.key!==key||this.session.expiresAt<Date.now()){
        const {challenge}=await this.request(origin+'/challenge');
        if(typeof challenge!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(challenge))throw new Error('Desafío del banco inválido.');
        const proof=await this.bridge.engine.request('identity_proof',{payload:await this.deriveNonce(origin,challenge)},900000);
        if(this.bridge.identity?.xuid!==identity.xuid)throw new Error('La cuenta cambió.');
        const result=await this.request(origin+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,proof})});
        if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token)||result.xuid!==identity.xuid)throw new Error('Sesión del banco inválida.');
        this.session={key,token:result.token,expiresAt:Date.now()+50*60000};
      }
      const current=record(await this.request(origin+'/me',{headers:{Authorization:'Bearer '+this.session.token}}));
      if(this.bridge.identity?.xuid!==identity.xuid)throw new Error('La cuenta cambió.');
      if(cached&&current.recordedAt<cached.recordedAt)throw new Error('El banco devolvió un registro anterior.');
      await this.cache.write(origin,identity.xuid,current);
      return {record:current,status:'Último registro del servidor'};
    }catch(error){if(error.status===401)this.session=null;return {record:cached,status:cached?'Último registro guardado · sin conexión':'Sin registro del servidor'};}
  }
  refresh(origin){if(!this.pending)this.pending=this.read(origin).finally(()=>{this.pending=null;});return this.pending;}
}
module.exports={BankClient,endpoint,record};
