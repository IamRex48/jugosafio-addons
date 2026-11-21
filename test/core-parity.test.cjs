const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const shared=require('../packages/core');
const original=require('./reference/core.cjs'),publish=original;
function result(fn,value){try{return {value:fn(structuredClone(value))};}catch(e){return {error:e.message};}}
const pack={uuid:'3960504b-f277-484b-9c7b-c865e19bc50e',version:[2,2,6],kind:'data',url:'https://example.org/test.mcpack',sha256:'a'.repeat(64)};
test('PC original and shared validation accept and reject the same feeds',()=>{
 const feeds=[{schema:1,packs:[]},{schema:1,packs:[pack]},null,{}, {schema:2,packs:[]},{schema:1,packs:[pack,pack]}];
 for(const change of [{url:'http://example.org/x'},{url:'https://user:password@example.org/x'},{url:'https://github.com/OWNER/REPO/x'},{uuid:'bad'},{kind:'script'},{version:[1,-1,0]},{sha256:'a'},{version:[1,0,NaN]}])feeds.push({schema:1,packs:[{...pack,...change}]});
 for(const feed of feeds)assert.deepEqual(result(shared.validateFeed,feed),result(original.validateFeed,feed));
});
test('pack planning keeps version, removal and dependency warnings identical',()=>{
 const next={...pack,version:[2,2,5],dependencies:[{uuid:'00000000-0000-0000-0000-000000000000',version:[1,0,0]}]};
 for(const options of [{},{replaceAll:true},{removeIds:[pack.uuid]}])for(const incoming of [[],[pack],[next]])assert.deepEqual(shared.packPlan([pack],incoming,options),publish.packPlan([pack],incoming,options));
});
test('same shared module executes without Node require or Buffer in an isolated JS runtime',()=>{
 const calendarContext={};vm.createContext(calendarContext);vm.runInContext(fs.readFileSync(path.join(__dirname,'../packages/core/calendar.js'),'utf8'),calendarContext);
 const context={URL,module:{exports:{}},require:name=>{assert.equal(name,'./calendar');return calendarContext.fonyxCalendar;}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../packages/core/index.js'),'utf8'),context);
 assert.equal(vm.runInContext('typeof Buffer',context),'undefined');
 assert.equal(context.module.exports.validateFeed({schema:1,packs:[pack]}).packs[0].uuid,pack.uuid);
 assert.equal(context.module.exports.calendar.days(2026,11).filter(Boolean).length,30);
});
test('migrated PC calls the shared functions rather than copies',()=>{
 const migrated=require('../apps/desktop/src/core'),publisher=require('../apps/desktop/src/github-publish');
 assert.equal(migrated.validateFeed,shared.validateFeed);assert.equal(publisher.packPlan,shared.packPlan);
});
