const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {connectUri,validateContent,utf8Bytes}=require('../packages/core/content');
const original=require('./reference/core.cjs');
const base=require('../apps/mobile/content.json');
function outcome(fn,value){try{return {value:fn(value)};}catch(error){return {error:error.message};}}
test('server URIs match PC for domains, IPv4, IPv6 zones and rejected input',()=>{
 for(const host of ['mapajugoR.aternos.me','127.0.0.1','::1','2001:db8::1','fe80::1%eth0','::ffff:192.168.1.2','::ffff:192.168.01.2',':::1','x&command=bad','a..b','-a.org','example.org:19132','a'.repeat(254),null])for(const port of [0,19132,65535,65536])assert.deepEqual(outcome(x=>connectUri(x,port),host),outcome(x=>original.connectUri(x,port),host));
});
test('content and event errors and normalized output match original PC',()=>{
 const inputs=[base,{...base,surprise:'ignored'},null,{...base,schema:2},{...base,port:0},{...base,notices:[{tag:'x',title:'x',text:1}]}];
 for(const change of [{bankEndpoint:'http://bank.example'},{manifestUrl:'http://example.org'},{accent:'bad'},{name:''},{voiceEnabled:'yes'}]){const content=structuredClone(base);Object.assign(content.events[0],change);inputs.push(content);}
 for(const input of inputs)assert.deepEqual(outcome(validateContent,input),outcome(original.validateContent,input));
});
test('portable UTF-8 size matches Node for emoji and lone surrogates',()=>{
 for(const text of ['ascii','é','你好','😀','\ud800','\udfff','\ud800\ud800','a😀z',JSON.stringify(base)])assert.equal(utf8Bytes(text),Buffer.byteLength(text));
});
