const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyIdentity}=require('../packages/core/identity');
const keys=[{kid:'fixture',kty:'RSA',use:'sig'}];
function proof(){return {token:[{alg:'RS256',kid:'fixture'},{iss:'https://authorization.franchise.minecraft-services.net/',aud:'api://auth-minecraft-services/multiplayer',exp:Date.now()/1000+3600,xname:'Player One',xid:'123',cpk:'fixture'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.fixture',signature:'fixture'};}
test('async or nonboolean crypto adapters fail closed instead of authenticating on a truthy promise',()=>{
 assert.throws(()=>verifyIdentity(proof(),'nonce',keys,{verifyRSA:()=>Promise.resolve(true),verifyEC:()=>true}),/Firma/);
 assert.throws(()=>verifyIdentity(proof(),'nonce',keys,{verifyRSA:()=>true,verifyEC:()=>Promise.resolve(true)}),/sesión/);
 for(const value of ['true',1,{},null])assert.throws(()=>verifyIdentity(proof(),'nonce',keys,{verifyRSA:()=>value,verifyEC:()=>true}),/Firma/);
});
