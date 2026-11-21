const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),pc=path.join(root,'apps/desktop/src/voice/addon-bridge.js');
let source=fs.readFileSync(pc,'utf8');const start=source.indexOf('class AddonBridge extends EventEmitter'),end=source.indexOf('module.exports=',start);assert(start>=0&&end>start);
let shared=source.slice(start,end);
shared=shared.replace('constructor({executable,cacheDir,engine,loadKeys=identityKeys})','constructor({engine,loadKeys,verifyIdentity,nonce,checkTransport=async()=>{}})');
shared=shared.replace("super();this.executable=executable;this.engine=engine||new ProxyEngine({executable,cacheDir});this.loadKeys=loadKeys;","super();Object.assign(this,{engine,loadKeys,verifyIdentity,nonce,checkTransport});");
shared=shared.replace('    this.checkExecutable=!engine;\n','');
const check="    if(this.checkExecutable){const hash=crypto.createHash('sha256').update(await fs.readFile(this.executable)).digest('hex');if(hash!==ENGINE_SHA256)throw new Error('El motor de conexión no corresponde a la versión comprobada de VCMC.');}";
assert(shared.includes(check));shared=shared.replace(check,'    await this.checkTransport();');
shared=shared.replace("const nonce=crypto.randomBytes(24).toString('base64url');let proof;","const nonce=await this.nonce();if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(nonce))throw new Error('No se pudo preparar el desafío de identidad.');let proof;");
shared=shared.replace('const identity=verifyIdentity(proof,nonce,await this.loadKeys());','const identity=this.verifyIdentity(proof,nonce,await this.loadKeys());');
fs.writeFileSync(path.join(root,'packages/core/addon-bridge.js'),"const {EventEmitter}=require('events');\nconst normalize=name=>name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();\n"+shared+'\nmodule.exports={AddonBridge};\n');
const wrapper=`const {AddonBridge:SharedAddonBridge}=require('../../../../packages/core/addon-bridge');
class AddonBridge extends SharedAddonBridge {
  constructor({executable,cacheDir,engine,loadKeys=identityKeys}) {
    super({engine:engine||new ProxyEngine({executable,cacheDir}),loadKeys,verifyIdentity,
      nonce:()=>crypto.randomBytes(24).toString('base64url'),
      checkTransport:async()=>{if(!engine){const hash=crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');if(hash!==ENGINE_SHA256)throw new Error('El motor de conexión no corresponde a la versión comprobada de VCMC.');}}
    });
    this.executable=executable;this.checkExecutable=!engine;
  }
}
`;
source=source.slice(0,start)+wrapper+source.slice(end);fs.writeFileSync(pc,source);
