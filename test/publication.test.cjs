const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkFeed,audit,json}=require('../scripts/check-publication.cjs');
const uuid='3960504b-f277-484b-9c7b-c865e19bc50e',sha='a'.repeat(64),url='https://github.com/IamRex48/jugosafio-addons/releases/download/packs/voice.mcpack';
const pack=()=>({uuid,kind:'data',version:[2,2,7],sha256:sha,url});
const releases=()=>[{tag_name:'packs',assets:[{name:'voice.mcpack',digest:'sha256:'+sha}]}];
test('acepta packs schema 1 existentes y verifica el digest del asset',()=>{assert.deepEqual(checkFeed({schema:1,packs:[pack()]},releases()).errors,[]);});
test('detecta el fallo real de una referencia a asset eliminado',()=>{assert.match(checkFeed({schema:1,packs:[pack()]},[{tag_name:'packs',assets:[]}]).errors.join(' '),/falta voice.mcpack/);});
test('rechaza SHA incorrecto, UUID repetidos, versiones inválidas y HTTP',()=>{
  for(const changed of [{sha256:'b'.repeat(64)},{version:[1,-1,0]},{url:'http://example.org/pack'}])assert.ok(checkFeed({schema:1,packs:[{...pack(),...changed}]},releases()).errors.length);
  assert.match(checkFeed({schema:1,packs:[pack(),pack()]},releases()).errors.join(' '),/repetido/);
});
test('revisa dependencias ausentes y mantiene los paquetes combinados como advertencia',()=>{
  const combined={...pack(),url:'https://example.org/combined.mcaddon',dependencies:[{uuid:'00000000-0000-0000-0000-000000000000'}]};
  const result=checkFeed({schema:1,packs:[combined]},[]);assert.match(result.errors.join(' '),/dependencia/);assert.match(result.warnings.join(' '),/combinado/);
});
test('audita exclusivamente con lecturas y falla cuando latest no incluye configuración',async()=>{
  const calls=[];const report=await audit({load:async url=>{calls.push(url);return url.includes('?')?[]:{tag_name:'incorrecta',assets:[]};}});assert.equal(report.ok,false);assert.match(report.errors[0],/launcher-content/);assert.equal(calls.length,2);
});
test('red rechaza HTTP y HTTP 404 sin reenviar credenciales a fuentes externas',async()=>{
  await assert.rejects(json('http://example.org'),/HTTPS/);
  await assert.rejects(json('https://example.org',{fetchImpl:async(_,options)=>{assert.equal(options.headers.Authorization,undefined);return {ok:false,status:404};}}),/404/);
});
