const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const {ProxyEngine}=require('./proxy-engine');
const {fetchJson}=require('../core');
const ENGINE_SHA256='30d78b089122ad412fdfcf02cff503230db14cc303874d06ba61bf31fd6a63bd';

// Contracts observed in the Windows transport and identity prover. Tokens stay in the main process.
const sharedIdentity=require('../../../../packages/core/identity');
const identityCrypto={
  verifyRSA:(message,key,signature)=>crypto.verify('RSA-SHA256',Buffer.from(message),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(signature,'base64url')),
  verifyEC:(encoded,message,signature)=>{
    const key=crypto.createPublicKey({key:Buffer.from(encoded,'base64'),format:'der',type:'spki'});
    return key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails.namedCurve==='secp384r1'&&crypto.verify('sha384',Buffer.from(message),key,Buffer.from(signature,'base64'));
  }
};
function verifyIdentity(proof,nonce,keys,now=Date.now()){return sharedIdentity.verifyIdentity(proof,nonce,keys,identityCrypto,now);}
const identityKeys=()=>sharedIdentity.identityKeys(fetchJson);
const {AddonBridge:SharedAddonBridge}=require('../../../../packages/core/addon-bridge');
class AddonBridge extends SharedAddonBridge {
  constructor({executable,cacheDir,engine,loadKeys=identityKeys}) {
    super({engine:engine||new ProxyEngine({executable,cacheDir}),loadKeys,verifyIdentity,
      nonce:()=>crypto.randomBytes(24).toString('base64url'),
      checkTransport:async()=>{if(!engine){const hash=crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');if(hash!==ENGINE_SHA256)throw new Error('El motor de conexión no corresponde a la versión comprobada de VCMC.');}}
    });
    this.executable=executable;this.checkExecutable=!engine;
  }
}
module.exports={AddonBridge,verifyIdentity,identityKeys,ENGINE_SHA256};
