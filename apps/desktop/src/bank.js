const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {platformFetch}=require('./network');
const {atomicJson}=require('./core');
const {BankClient:SharedBankClient,endpoint,record}=require('../../../packages/core/bank');
const proofNonce=(origin,challenge)=>crypto.createHash('sha256').update('fonyx-bank-v1|'+origin+'|'+challenge).digest('base64url');
async function json(url,options={}){
  const response=await platformFetch(url,{...options,signal:AbortSignal.timeout(8000)});
  if(!response.ok){await response.body.cancel();const error=new Error('El banco no está disponible.');error.status=response.status;throw error;}
  const reader=response.body.getReader();let data='',bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;if((bytes+=value.length)>16384)throw new Error('Respuesta del banco demasiado grande.');data+=Buffer.from(value).toString('utf8');}}finally{await reader.cancel();}
  return JSON.parse(data);
}
class BankClient extends SharedBankClient {
  constructor({directory,bridge,request=json}) {
    const file=(origin,xuid)=>path.join(directory,crypto.createHash('sha256').update(origin+'|'+xuid).digest('hex')+'.json');
    super({bridge,request,deriveNonce:proofNonce,cache:{
      read:async(origin,xuid)=>JSON.parse(await fs.readFile(file(origin,xuid),'utf8')),
      write:(origin,xuid,value)=>atomicJson(file(origin,xuid),value)
    }});
    this.directory=directory;
  }
}
module.exports={BankClient,endpoint,proofNonce,record};
