const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadContent}=require('../apps/mobile/content-source');
const base=require('../apps/mobile/content.json');
const event=base.events[0];
const {validateContent}=require('../packages/core/content');
test('a broken source does not replace valid content and a valid fallback is used',async()=>{
 const calls=[];const content={...base,events:[event]};
 assert.deepEqual(await loadContent(['https://bad.example/','https://good.example/'],async url=>{calls.push(url);if(url.includes('bad.'))return {schema:2};return content;}),validateContent(content));
 assert.equal(calls.length,2);
});
test('rejects credential URLs, duplicate events and malformed events before rendering',async()=>{
 for(const events of [[event,event],[null],[{...event,manifestUrl:'https://user:pass@example.org'}]])await assert.rejects(loadContent(['https://example.org'],async()=>({...base,events})));
 await assert.rejects(loadContent(['http://example.org'],()=>{throw new Error('Must not fetch insecure source');}),/HTTPS/);
});
