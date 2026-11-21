// Private read-only broker. Expose only through your own HTTPS reverse proxy.
const http=require('node:http');
const crypto=require('node:crypto');
const {verifyIdentity,identityKeys}=require('../src/voice/addon-bridge');
const {endpoint,proofNonce,record}=require('../src/bank');
const nameKey=value=>typeof value==='string'&&value.trim().length>0&&value.length<=40?value.trim().toLowerCase():null;
async function body(req){
  let size=0;const chunks=[];
  for await(const chunk of req){if((size+=chunk.length)>131072)throw new Error('Solicitud demasiado grande.');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks));
}
function createBankServer({origin,secret,loadKeys=identityKeys,verify=verifyIdentity,now=Date.now}){
  origin=endpoint(origin);if(!origin||typeof secret!=='string'||secret.length<32)throw new Error('Configura FONYX_BANK_ORIGIN y una clave de servidor de al menos 32 caracteres.');
  const challenges=new Map(),sessions=new Map(),records=new Map();let keyCache=null,keyTime=0;
  const digest=value=>crypto.createHash('sha256').update(value).digest();
  return http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const prune=map=>{for(const [key,value] of map)if(value.expiresAt<=now())map.delete(key);};
    try{
      prune(challenges);prune(sessions);
      if(req.method==='GET'&&req.url==='/challenge'){
        if(challenges.size>=100)return send(429,{error:'busy'});
        const challenge=crypto.randomBytes(24).toString('base64url');challenges.set(challenge,{expiresAt:now()+60000});return send(200,{challenge});
      }
      if(req.method==='POST'&&req.url==='/ingest'){
        if(!crypto.timingSafeEqual(digest(String(req.headers['x-fonyx-server-key']||'')),digest(secret)))return send(401,{error:'unauthorized'});
        const value=await body(req);
        if(!Array.isArray(value.players)||value.players.length>1000)throw new Error('Jugadores inválidos.');
        const updates=value.players.map(player=>{const key=nameKey(player.name);if(!key)throw new Error('Nombre inválido.');return [key,record({...player,recordedAt:now()})];});
        records.clear();for(const [key,value] of updates)records.set(key,value);
        return send(200,{ok:true});
      }
      if(req.method==='POST'&&req.url==='/session'){
        if(sessions.size>=1000)return send(429,{error:'busy'});
        const {challenge,proof}=await body(req),pending=challenges.get(challenge);challenges.delete(challenge);
        if(!pending||pending.expiresAt<=now())return send(401,{error:'challenge_expired'});
        if(!keyCache||now()-keyTime>3600000){keyCache=await loadKeys();keyTime=now();}
        let identity;try{identity=verify(proof,proofNonce(origin,challenge),keyCache,now());}catch{return send(401,{error:'identity_rejected'});}
        const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{identity,expiresAt:now()+3600000});return send(200,{token,xuid:identity.xuid});
      }
      if(req.method==='GET'&&req.url==='/me'){
        const session=sessions.get(String(req.headers.authorization||'').replace(/^Bearer /,''));
        if(!session)return send(401,{error:'unauthorized'});
        const value=records.get(nameKey(session.identity.name));
        if(!value||now()-value.recordedAt>90000)return send(404,{error:'no_fresh_record'});
        return send(200,value);
      }
      return send(404,{error:'not_found'});
    }catch{return send(400,{error:'invalid_request'});}
  });
}
if(require.main===module){const server=createBankServer({origin:process.env.FONYX_BANK_ORIGIN,secret:process.env.FONYX_BANK_SERVER_KEY});server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||8788),'127.0.0.1',()=>console.log('Banco Fonyx: escuchando en localhost; configura tu proxy HTTPS.'));}
module.exports={createBankServer};
