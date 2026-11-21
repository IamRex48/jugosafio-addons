const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {socketAdapter}=require('../apps/mobile/socket-adapter');
class FakeSocket extends EventEmitter{
 readyState=0;sent=[];closed=[];
 addEventListener(type,fn){this.on(type,fn);}
 send(value){this.sent.push(value);}
 close(...args){this.closed.push(args);this.emit('close',{code:1000,reason:''});}
}
test('native socket sends only the selected byte slice and preserves binary/text distinction',()=>{
 const Socket=socketAdapter(FakeSocket),socket=new Socket('wss://example.org');socket.native.emit('open');
 socket.send(Uint8Array.from([9,1,2,9]).subarray(1,3));assert.deepEqual([...new Uint8Array(socket.native.sent[0])],[1,2]);
 const events=[];socket.on('message',(data,binary)=>events.push({data,binary}));
 socket.native.emit('message',{data:'ignored text'});socket.native.emit('message',{data:Uint8Array.from([1,2]).buffer});
 assert.equal(events[0].binary,false);assert.deepEqual([...events[1].data],[1,2]);assert.equal(events[1].binary,true);socket.terminate();
});
test('native socket refuses oversized or unsupported frames',()=>{
 const Socket=socketAdapter(FakeSocket),socket=new Socket('wss://example.org',{maxPayload:2});socket.native.emit('open');
 socket.native.emit('message',{data:Uint8Array.from([1,2,3]).buffer});assert.equal(socket.native.closed[0][0],4009);
});
