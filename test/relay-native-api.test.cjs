const {test}=require('node:test'),assert=require('node:assert/strict'),{Server:WebSocketServer}=require('ws');
const {RelaySession}=require('../packages/core/relay-session'),{socketAdapter}=require('../apps/mobile/socket-adapter');
test('native-style WebSocket API interoperates with the shared session and waits for relay verification',{timeout:10000},async()=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise(resolve=>server.once('listening',resolve));
 const session=new RelaySession({WebSocketImpl:socketAdapter(globalThis.WebSocket),endpoint:'ws://127.0.0.1:'+server.address().port,deviceToken:'a'.repeat(32),platform:'fonyx-android'});
 let socket;const opened=new Promise(resolve=>server.once('connection',s=>{socket=s;resolve();}));
 try{
  await session.connectReady({name:'Player One'},3000);await opened;assert.equal(session.snapshot().verified,false);
  const verified=new Promise(resolve=>session.on('event',event=>{if(event.type==='verified')resolve();}));
  socket.send(Buffer.from([14]));await verified;assert.equal(session.snapshot().verified,true);
  const message=new Promise(resolve=>{const listener=data=>{if(data[0]===6){socket.off('message',listener);resolve(data);}};socket.on('message',listener);});
  session.controls({muted:true,deafened:false});assert.equal((await message).toString('hex'),'0601');
 }finally{session.disconnect();for(const client of server.clients)client.terminate();await new Promise(resolve=>server.close(resolve));}
});
