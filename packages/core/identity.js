const {Buffer}=require('buffer');
const ISSUER='https://authorization.franchise.minecraft-services.net/';
const normalize=name=>name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
const decodeJson=value=>JSON.parse(Buffer.from(value.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
function verifyIdentity(proof,nonce,keys,crypto,now=Date.now()){
  if(typeof proof?.token!=='string'||typeof proof.signature!=='string')throw new Error('Microsoft no confirmó la identidad.');
  const token=proof.token.replace(/^MCToken\s+/i,''),parts=token.split('.');
  if(parts.length!==3)throw new Error('Prueba de Microsoft inválida.');
  const header=decodeJson(parts[0]),claims=decodeJson(parts[1]);
  const key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(header.alg!=='RS256'||!key||crypto.verifyRSA(parts[0]+'.'+parts[1],key,parts[2])!==true)throw new Error('Firma de Microsoft inválida.');
  if(claims.iss!==ISSUER||claims.aud!=='api://auth-minecraft-services/multiplayer'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now+30000)))throw new Error('La autorización de Minecraft caducó o no corresponde a este servicio.');
  if(typeof claims.xname!=='string'||!normalize(claims.xname)||claims.xname.length>40||typeof claims.xid!=='string'||!/^\d{1,20}$/.test(claims.xid)||claims.xid==='0'||typeof claims.cpk!=='string')throw new Error('La autorización no identifica una cuenta de Xbox.');
  if(crypto.verifyEC(claims.cpk,'vcmc-identity-v1:'+nonce,proof.signature)!==true)throw new Error('La prueba no pertenece a esta sesión.');
  return {name:claims.xname,xuid:claims.xid};
}
async function identityKeys(fetchJson){
  const config=await fetchJson(ISSUER+'.well-known/openid-configuration');
  const url=new URL(config.jwks_uri);
  if(config.issuer!==ISSUER||url.origin!==new URL(ISSUER).origin||url.username||url.password)throw new Error('Servicio de identidad de Minecraft inválido.');
  const result=await fetchJson(url.href);
  if(!Array.isArray(result.keys)||!result.keys.length)throw new Error('Microsoft no entregó sus claves de verificación.');
  return result.keys;
}
module.exports={verifyIdentity,identityKeys,ISSUER};
