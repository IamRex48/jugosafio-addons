const {test}=require('node:test'),assert=require('node:assert/strict');
const {downloadPlan}=require('../packages/core/download-plan');
const a={uuid:'3960504b-f277-484b-9c7b-c865e19bc50e',kind:'data',version:[2,2,6],url:'https://example.org/combined.mcaddon',sha256:'a'.repeat(64)};
const b={...a,uuid:'73f2c582-9ff0-4fc1-a7a7-8c77bb18f44c',kind:'resources'};
test('a combined addon is imported once while all its pack identities are retained',()=>{
 const plan=downloadPlan({schema:1,packs:[a,b]});assert.equal(plan.length,1);assert.deepEqual(plan[0].packs,[a,b]);
 assert.equal(downloadPlan({schema:1,packs:[a,{...b,url:'https://other.example/combined.mcaddon'}]}).length,2);
});
test('a repeated UUID is rejected before preparing any imports',()=>assert.throws(()=>downloadPlan({schema:1,packs:[a,a]}),/identificador/));
