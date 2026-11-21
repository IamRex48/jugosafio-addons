const {test}=require('node:test');
const assert=require('node:assert/strict');
const wire=require('../src/voice/relay-protocol');
test('frames salientes coinciden con el protocolo observado y miden UTF-8 en bytes',()=>{
  assert.equal(wire.mute(true).toString('hex'),'0601');assert.equal(wire.deafen(false).toString('hex'),'2300');assert.equal(wire.level(155).toString('hex'),'1864');
  const encoded=wire.signal('é',{candidate:'ice'});assert.equal(encoded[0],2);assert.equal(encoded[1],2);assert.equal(encoded.subarray(2,4).toString('hex'),'c3a9');
  assert.deepEqual(JSON.parse(wire.settings({audioRadius:15}).subarray(1).toString()),{audioRadius:15});
  assert.throws(()=>wire.mute(1));assert.throws(()=>wire.level(NaN));assert.throws(()=>wire.signal('a'.repeat(256),{}));
});
test('señales, verificación y políticas se decodifican sin ignorar frames pendientes',()=>{
  const outgoing=wire.signal('test',{type:'offer',sdp:'example'});outgoing[0]=3;
  assert.deepEqual(wire.decode(outgoing),{type:'signal',peer:'test',payload:{type:'offer',sdp:'example'}});
  assert.deepEqual(wire.decode(Buffer.from([7,1])),{type:'forced-mute',value:true});
  assert.deepEqual(wire.decode(Buffer.concat([Buffer.from([13]),Buffer.from('CODE')])),{type:'verification-required',value:'CODE'});
  const unported=Buffer.from([39,1,2,3]);assert.deepEqual(wire.decode(unported),{type:'unported',opcode:39,data:unported});
  assert.throws(()=>wire.decode(Buffer.from([3,5,1])));assert.throws(()=>wire.decode(Buffer.from([7,4])));assert.throws(()=>wire.decode(Buffer.from([12,123])));
});
