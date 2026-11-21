const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createPublisher}=require('../packages/core/github-publish');
const content=require('../apps/desktop/launcher-content.json');
const reference=fs.readFileSync(require.resolve('./reference/publisher-functions.cjs'),'utf8');
assert.equal(crypto.createHash('sha256').update(reference.replace(/\r\n/g,'\n')).digest('hex'),require('./reference/publisher-provenance.json').frozenFunctionsSha256);
const bytes=Buffer.from('own prepared pack fixture'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
const pack={uuid:'12345678-1234-1234-1234-123456789abc',version:[1,2,3],kind:'resources',sha256:hash,file:'private-fixture',name:'Fixture'};
const feed={schema:1,packs:[{...pack,file:undefined,url:'https://example.org/old.mcpack'}]};
const now=1795251600000,id=now.toString(36)+'-00000000';
class FixedDate extends Date{static now(){return now;}}
function mock(options={}){
 let next=20;const files=[{id:10,name:'launcher-content.json'},{id:11,name:'Fonyx-Jugadores.exe'}],calls=[];
 const request=async(token,method,address,body)=>{
  const url=new URL(address),p=url.pathname;
  calls.push({method,url:address,body:Buffer.isBuffer(body)?body.toString('utf8'):body});
  if(p==='/user')return {login:'Admin'};
  if(p==='/repos/IamRex48/jugosafio-addons')return {private:false,permissions:{push:!options.noPermission}};
  if(p.endsWith('/releases/latest'))return {id:1,immutable:options.immutable||false,html_url:'https://github.com/IamRex48/jugosafio-addons/releases/tag/example'};
  if(method==='GET'&&p.endsWith('/releases/1/assets'))return structuredClone(files);
  if(method==='POST'){
   if(options.failUpload)throw new Error('upload failed');
   const name=url.searchParams.get('name');
   const item={id:++next,name,state:'uploaded',size:body.length+(options.incomplete?1:0),digest:'sha256:'+crypto.createHash('sha256').update(body).digest('hex'),browser_download_url:'https://github.com/IamRex48/jugosafio-addons/releases/download/example/'+name};
   files.push(item);
   if(options.conflict&&name.startsWith('launcher-content-pending'))files[0].id=999;
   return item;
  }
  if(method==='PATCH'){
   if(options.failRename&&body.name==='launcher-content.json'&&Number(p.split('/').pop())!==10)throw new Error('rename failed');
   const item=files.find(x=>x.id===Number(p.split('/').pop()));assert(item);item.name=body.name;return item;
  }
  throw new Error('Unexpected mock route');
 };
 return {request,calls,files};
}
function publisher(shared,request){
 const nativeCrypto={...crypto,randomBytes:()=>Buffer.alloc(4)},readPack=async()=>bytes;
 if(shared)return createPublisher({request,readPack,sha256:data=>crypto.createHash('sha256').update(data).digest('hex'),uniqueId:()=>id,fetchFeed:async()=>structuredClone(feed)});
 const context={Buffer,URL,Date:FixedDate,structuredClone,core:{...require('./reference/core.cjs'),fetchJson:async()=>structuredClone(feed)},crypto:nativeCrypto,fsp:{readFile:readPack},request,module:{exports:{}}};
 vm.runInNewContext(reference,context);return context.module.exports;
}
async function run(shared,scenario){
 const fake=mock(scenario),pub=publisher(shared,fake.request),input=structuredClone(content),before=JSON.stringify(input);
 let result,error;
 try{result=await pub.publish({token:'a'.repeat(30),content:input,eventId:'jugosafio',transport:fake.request,...scenario.args});}
 catch(e){error=e.message;}
 assert.equal(JSON.stringify(input),before,'publishing must not mutate editor state');
 assert(fake.files.some(x=>x.id===11&&x.name==='Fonyx-Jugadores.exe'));
 assert(!fake.calls.some(x=>x.method==='DELETE'));
 return JSON.parse(JSON.stringify({result,error,calls:fake.calls,files:fake.files}));
}
test('shared publication preserves PC requests, rollback, conflicts and pack changes',async()=>{
 const scenarios=[{}, {noPermission:true},{immutable:true},{failUpload:true},{failRename:true},{conflict:true},{incomplete:true},
  {args:{base:{releaseId:99,assetId:10}}},
  {args:{packs:[pack],replaceAll:true}},
  {args:{packs:[pack]}},
  {args:{packs:[{...pack,sha256:'0'.repeat(64)}]}},
  {args:{removeIds:[pack.uuid.toUpperCase()]}},
  {args:{replaceAll:true}},
  {args:{removeIds:['invalid']}},
 ];
 for(const scenario of scenarios)assert.deepEqual(await run(true,scenario),await run(false,scenario),JSON.stringify(scenario));
});
test('publisher core loads without Node filesystem, crypto or structuredClone',async()=>{
 const source=fs.readFileSync(require.resolve('../packages/core/github-publish'),'utf8');
 const context={URL,Date,console,module:{exports:{}},require:name=>{
  if(name==='buffer')return require('buffer');if(name==='./index')return require('../packages/core');if(name==='./content')return require('../packages/core/content');throw new Error('Unexpected platform dependency '+name);
 }};
 vm.runInNewContext(source,context);
 const fake=mock(),pub=context.module.exports.createPublisher({request:fake.request,readPack:async()=>bytes,sha256:data=>crypto.createHash('sha256').update(data).digest('hex'),uniqueId:()=>id,fetchFeed:async()=>structuredClone(feed)});
 const result=await pub.publish({token:'a'.repeat(30),content,eventId:'jugosafio',transport:fake.request});
 assert.equal(result.base.releaseId,1);assert(result.base.assetId>10);
 await assert.rejects(pub.authorize('short'),/token/);
});
