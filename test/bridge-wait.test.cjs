const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {AddonBridge}=require('../packages/core/addon-bridge');
function setup(){const engine=new EventEmitter();engine.request=async()=>({port:19189});const bridge=new AddonBridge({engine});bridge.identity={name:'Player One',xuid:'123'};return {bridge,engine};}
test('a timeout never turns an unconfirmed game connection into connected',async()=>{
 const {bridge,engine}=setup();await bridge.start('example.org',19132);
 await assert.rejects(bridge.waitForServer(5),/tiempo/);assert.equal(bridge.connected,false);assert.equal(engine.listenerCount('engine-event'),1);
});
test('only matching Minecraft identity followed by server_connected completes the wait',async()=>{
 const {bridge,engine}=setup();await bridge.start('example.org',19132);
 const ready=bridge.waitForServer(1000);engine.emit('engine-event',{event:'minecraft_authenticated',xuid:'123'});assert.equal(bridge.connected,false);
 engine.emit('engine-event',{event:'server_connected',gamertag:'Player One'});
 assert.deepEqual(await ready,{host:'127.0.0.1',port:19189});assert.equal(bridge.connected,true);assert.equal(engine.listenerCount('engine-event'),1);
});
test('a wrong account rejects the wait immediately and does not remain connected',async()=>{
 const {bridge,engine}=setup();await bridge.start('example.org',19132);const ready=bridge.waitForServer(1000);
 engine.emit('engine-event',{event:'minecraft_authenticated',xuid:'999'});await assert.rejects(ready,/coincide/);assert.equal(bridge.connected,false);
});
