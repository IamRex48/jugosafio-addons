const {test}=require('node:test'),assert=require('node:assert/strict');
const {identityKeys,ISSUER}=require('../packages/core/identity');
test('identity verification never takes signing keys from another origin or embedded credentials',async()=>{
 for(const jwks_uri of ['https://other.example/keys','http://authorization.franchise.minecraft-services.net/keys','https://user:pass@authorization.franchise.minecraft-services.net/keys']){
  let calls=0;await assert.rejects(identityKeys(async()=>{calls++;return {issuer:ISSUER,jwks_uri};}),/identidad/);assert.equal(calls,1);
 }
 const keys=[{kid:'fixture'}];let count=0;
 assert.deepEqual(await identityKeys(async()=>++count===1?{issuer:ISSUER,jwks_uri:ISSUER+'keys'}:{keys}),keys);
});
