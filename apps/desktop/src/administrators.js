const publishing=require('./github-publish');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {platformFetch}=require('./network');

const OWNER='lRex848';
const INITIAL=[OWNER,'Fabicho5154662'];
const FILE='launcher-admins.json';
const key=name=>typeof name==='string'?name.normalize('NFC').trim().toLowerCase():'';
function gamertag(value){
  if(typeof value!=='string')throw new Error('Escribe el gamertag de Xbox.');
  const name=value.normalize('NFC').trim();
  if(name.length>32||! /^[\p{L}\p{N}][\p{L}\p{N} ]*(?:#[0-9]{3,5})?$/u.test(name))throw new Error('Escribe un gamertag de hasta 32 caracteres, con su sufijo # si lo tiene.');
  return name;
}
function validate(value){
  if(!value||value.schema!==1||!Array.isArray(value.admins)||value.admins.length<1||value.admins.length>100)throw new Error('La lista de administradores no es válida.');
  const admins=value.admins.map(gamertag),keys=admins.map(key);
  if(new Set(keys).size!==keys.length||!keys.includes(key(OWNER)))throw new Error('La lista debe conservar la cuenta principal y no repetir gamertags.');
  return {schema:1,admins};
}
function decode(file){
  if(file?.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||file.content.length>24000||! /^[a-f0-9]{40,64}$/i.test(file.sha||''))throw new Error('GitHub devolvió una lista de administradores no válida.');
  return {policy:validate(JSON.parse(Buffer.from(file.content,'base64').toString('utf8'))),sha:file.sha};
}
async function readPublicPolicy(fetch=platformFetch){
  const response=await fetch(`https://raw.githubusercontent.com/${publishing.REPO}/HEAD/${FILE}?fonyx=${Math.floor(Date.now()/120000)}`,{signal:AbortSignal.timeout(7000)});
  if(!response.ok){await response.body?.cancel();const error=new Error('No se pudo leer la lista de administradores.');error.status=response.status;throw error;}
  const chunks=[];let length=0;
  for await(const chunk of Readable.fromWeb(response.body)){length+=chunk.length;if(length>16000)throw new Error('La lista de administradores es demasiado grande.');chunks.push(chunk);}
  const body=Buffer.concat(chunks);
  return {type:'file',encoding:'base64',content:body.toString('base64'),sha:crypto.createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex')};
}
class AdminRegistry{
  constructor({client=publishing.client,authorize=publishing.authorize,readPublic=readPublicPolicy,readCache=async()=>null,writeCache=async()=>{}}={}){
    this.client=client;this.authorize=authorize;this.readPublic=readPublic;this.readCache=readCache;this.writeCache=writeCache;
    this.policy={schema:1,admins:[...INITIAL]};this.sha=null;this.source='Lista incluida';this.warning='';this.generation=0;this.changing=false;this.refreshing=null;this.cacheTail=Promise.resolve();
  }
  has(name){return this.policy.admins.some(admin=>key(admin)===key(name));}
  snapshot(){return {owner:OWNER,names:[...this.policy.admins],source:this.source,warning:this.warning,sha:this.sha};}
  async remember(){
    const snapshot=structuredClone({policy:this.policy,sha:this.sha});
    const pending=this.cacheTail.then(()=>this.writeCache(snapshot));this.cacheTail=pending.catch(()=>{});
    try{await pending;}
    catch{this.warning='La lista se actualizó, pero no pudo guardarse para usarla sin conexión.';}
  }
  async load(){
    try{
      const saved=await this.readCache();
      if(saved){const policy=validate(saved.policy);if(saved.sha!==null&&! /^[a-f0-9]{40,64}$/i.test(saved.sha||''))throw new Error('Cache inválida');this.policy=policy;this.sha=saved.sha;this.source='Última lista disponible';}
    }catch{}
    return this.refresh();
  }
  async read(token=''){
    try{return decode(await (token?this.client(token)('GET','/contents/'+FILE):this.readPublic()));}
    catch(error){
      if(error.status===404&&!this.sha)return {policy:{schema:1,admins:[...INITIAL]},sha:null};
      if(error.status===404)throw new Error('La lista publicada ya no está disponible. Se conserva la última lista recibida.');
      throw error;
    }
  }
  async refresh(){
    if(this.changing)return this.snapshot();
    if(this.refreshing)return this.refreshing;
    const generation=this.generation;
    this.refreshing=(async()=>{
      try{
        const next=await this.read();
        if(generation!==this.generation)return this.snapshot();
        this.policy=next.policy;this.sha=next.sha;this.source=next.sha?'Lista de GitHub':'Lista inicial; se publicará al modificarla';this.warning='';await this.remember();
      }catch{if(generation===this.generation)this.warning='Sin conexión con la lista de GitHub. Se conserva la última lista disponible.';}
      return this.snapshot();
    })();
    try{return await this.refreshing;}finally{this.refreshing=null;}
  }
  async change({actor,name,grant,token}){
    const display=gamertag(name);
    if(typeof grant!=='boolean')throw new Error('Acción de administración no válida.');
    if(!this.has(actor))throw new Error('Esta opción requiere una cuenta administradora verificada.');
    if(!grant&&key(display)===key(OWNER))throw new Error('La cuenta principal conserva siempre la administración.');
    if(!token)throw new Error('Conecta GitHub para guardar los permisos en todas las computadoras.');
    if(this.changing)throw new Error('Espera a que termine el cambio de administradores.');
    this.changing=true;this.generation++;
    try{
      await this.authorize(token);
      const current=await this.read(token);
      // Recheck the actor against the authoritative list immediately before writing.
      this.policy=current.policy;this.sha=current.sha;this.source=current.sha?'Lista de GitHub':'Lista inicial';this.warning='';await this.remember();
      if(!this.has(actor))throw new Error('Tu cuenta ya no tiene administración. Actualiza la lista.');
      const exists=this.has(display);
      if(grant&&exists)throw new Error('Ese gamertag ya es administrador.');
      if(!grant&&!exists)throw new Error('Ese gamertag no está en la lista de administradores.');
      const next=validate({schema:1,admins:grant?[...current.policy.admins,display]:current.policy.admins.filter(admin=>key(admin)!==key(display))});
      let result;
      try{
        result=await this.client(token)('PUT','/contents/'+FILE,{
          message:'Fonyx: '+(grant?'añadir':'quitar')+' administrador '+display,
          content:Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64'),
          ...(current.sha?{sha:current.sha}:{})
        });
      }catch(error){
        if([409,422].includes(error.status))throw new Error('Otro administrador cambió la lista. Actualízala antes de volver a intentarlo.');
        throw error;
      }
      if(! /^[a-f0-9]{40,64}$/i.test(result?.content?.sha||''))throw new Error('GitHub no confirmó el cambio. Actualiza la lista antes de reintentar.');
      this.policy=next;this.sha=result.content.sha;this.source='Lista de GitHub';this.warning='';await this.remember();
      return this.snapshot();
    }finally{this.changing=false;}
  }
}
module.exports={AdminRegistry,OWNER,INITIAL,FILE,key,gamertag,validate,readPublicPolicy};
