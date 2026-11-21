const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const reference=require('./reference/relay-protocol.cjs'),wire=require('../packages/core/relay-protocol');
test('strict UTF-8 decoding preserves PC errors, BOM handling and valid Unicode',()=>{
 for(const data of [[13,...Buffer.from('CODE')],[13,0xef,0xbb,0xbf,...Buffer.from('CODE')],[13,0xc0,0xaf],[13,0xff],[13,...Buffer.from('😀é')]]){
  const bytes=Buffer.from(data);let expected;
  try{expected=reference.decode(bytes);}catch(error){assert.throws(()=>wire.decode(bytes),{name:error.name,message:error.message});continue;}
  assert.deepEqual(wire.decode(bytes),expected);
 }
});
test('the same relay module works without Node Buffer or TextDecoder using the bundled JS byte library',()=>{
 const context={module:{exports:{}},Uint8Array,require:name=>{assert.equal(name,'buffer');return require('buffer/');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../packages/core/relay-protocol'),'utf8'),context);
 const mobile=context.module.exports;
 for(const [fn,arg] of [['mute',true],['deafen',false],['level',80]])assert.equal(mobile[fn](arg).toString('hex'),reference[fn](arg).toString('hex'));
 const data=reference.signal('é',{type:'offer',sdp:'fixture'});data[0]=3;
 assert.deepEqual(JSON.parse(JSON.stringify(mobile.decode(data))),reference.decode(data));
});
