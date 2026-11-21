const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const WebSocket=require('ws');
const {RelaySession,validateOptions}=require('../src/voice/relay-session');
const wire=require('../src/voice/relay-protocol');
test('Jugar espera el enlace real de voz y rechaza el inicio si no responde',async()=>{
  const server=new WebSocket.Server({port:0});await once(server,'listening');
  const session=new RelaySession({endpoint:'ws://127.0.0.1:'+server.address().port,deviceToken:'a'.repeat(32)});
  try{assert.equal((await session.connectReady({name:'uno'})).connected,true);}finally{session.disconnect();for(const socket of server.clients)socket.terminate();await new Promise(r=>server.close(r));}
  const {EventEmitter}=require('node:events');class SilentSocket extends EventEmitter{readyState=0;terminate(){}}
  const silent=new RelaySession({WebSocketImpl:SilentSocket,deviceToken:'a'.repeat(32)});await assert.rejects(silent.connectReady({name:'uno'},20),/no respondió/);assert.equal(silent.closed,true);
});
function positions(players){return Buffer.concat([Buffer.from([4,players.length]),...players.map(p=>{const name=Buffer.from(p.name),data=Buffer.alloc(13);data.writeFloatLE(p.x,0);data.writeFloatLE(p.y,4);data.writeFloatLE(p.z,8);data[12]=p.dimension;return Buffer.concat([Buffer.from([name.length]),name,data]);})]);}
test('posición v1/v2, orientación y registro respetan el formato binario',()=>{
  const p={name:'uno',x:1,y:2,z:3,dimension:0},cache=new Map();assert.deepEqual(wire.decode(positions([p]),cache),{type:'positions',players:[p]});
  assert.deepEqual(wire.decode(Buffer.from([4,254,1,3,1,117,110,111]),cache).players,[p]);
  assert.throws(()=>wire.decode(Buffer.from([4,1,6,1])));
  const token='a'.repeat(32),registration=wire.register({room:'ABC',name:'uno',deviceToken:token});assert.equal(registration[0],1);assert.equal(registration.at(-1),8);
  assert.ok(registration.includes(Buffer.from(token)));assert.equal(wire.discover({name:'uno',deviceToken:token}).at(-1),1);
  assert.throws(()=>validateOptions({name:'?',room:''}));assert.throws(()=>validateOptions({name:'uno',room:{}}));
});
test('sesión completa valida al jugador antes de señalar y conserva la identidad local',async()=>{
  const server=new WebSocket.Server({port:0});await once(server,'listening');
  const session=new RelaySession({endpoint:'ws://127.0.0.1:'+server.address().port,deviceToken:'a'.repeat(32)}),received=[];
  const verified=new Promise(resolve=>session.on('event',e=>{if(e.type==='positions')resolve();}));
  server.on('connection',socket=>socket.on('message',data=>{received.push(Buffer.from(data));if(data[0]===17){socket.send(Buffer.concat([Buffer.from([13]),Buffer.from('VALIDCODE')]));socket.send(Buffer.from([14]));socket.send(positions([{name:'uno',x:0,y:0,z:0,dimension:0},{name:'dos',x:1,y:0,z:0,dimension:0}]));}}));
  try{
    assert.throws(()=>session.signal('dos',{}),/Verifica/);
    session.connect({name:'Uno'});await verified;assert.equal(session.snapshot().verified,true);assert.equal(session.snapshot().deviceToken,undefined);
    assert.throws(()=>session.signal('ajeno',{}),/jugador/);session.signal('dos',{candidate:'test'});session.controls({muted:true,deafened:false});session.level(42);
    await new Promise(r=>setTimeout(r,30));assert.ok(received.some(b=>b[0]===2));assert.ok(received.some(b=>b.toString('hex')==='0601'));assert.ok(received.some(b=>b.toString('hex')==='1800'));
    const muted=new Promise(resolve=>session.on('event',e=>{if(e.type==='self-deafen')resolve();})),count=received.length;
    for(const socket of server.clients){socket.send(Buffer.from([19,0]));socket.send(Buffer.from([37,1]));}
    await muted;assert.equal(session.snapshot().muted,false);assert.equal(session.snapshot().deafened,true);
    await new Promise(r=>setTimeout(r,20));assert.equal(received.length,count,'el cambio remoto no debe generar eco');
  }finally{session.disconnect();for(const socket of server.clients)socket.terminate();await new Promise(r=>server.close(r));}
});
