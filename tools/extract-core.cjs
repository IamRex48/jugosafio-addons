// One-time migration from the supplied PC source; originals remain untouched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=process.argv[2];assert(source&&fs.existsSync(path.join(source,'src','core.js')),'Supply the PC Fuentes directory');
const root=path.resolve(__dirname,'..'),desktop=path.join(root,'apps','desktop');
assert(!fs.existsSync(desktop),'Refuse to overwrite an existing migration');
fs.mkdirSync(desktop,{recursive:true});
for(const name of ['src','package.json','launcher-content.json','THIRD-PARTY-NOTICES.md'])fs.cpSync(path.join(source,name),path.join(desktop,name),{recursive:true});
const coreFile=path.join(desktop,'src','core.js'),publishFile=path.join(desktop,'src','github-publish.js');
let core=fs.readFileSync(coreFile,'utf8'),publish=fs.readFileSync(publishFile,'utf8');
function between(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a,start);return text.slice(a,b).trim();}
const https=between(core,'function https(value)','function validHost(');
const feed=between(core,'function version(v)','function validateContent(');
const plan=between(publish,'function packPlan(','async function assets(');
const uuid=/const UUID = ([^;]+);/.exec(core);assert(uuid);
fs.writeFileSync(path.join(root,'packages','core','index.js'),`'use strict';\nconst UUID = ${uuid[1]};\n${https}\n${feed}\n${plan}\nmodule.exports={https,validateFeed,packPlan,calendar:require('./calendar')};\n`);
fs.copyFileSync(path.join(desktop,'src','calendar.js'),path.join(root,'packages','core','calendar.js'));
core=core.replace(https,'').replace(feed,'const {https,validateFeed}=require(\'../../../packages/core\');');
publish=publish.replace(plan,'const {packPlan}=require(\'../../../packages/core\');');
fs.writeFileSync(coreFile,core);fs.writeFileSync(publishFile,publish);
fs.writeFileSync(path.join(root,'packages','core','package.json'),JSON.stringify({name:'@fonyx/core',version:'1.2.15-beta.3',private:true,main:'index.js'},null,2)+'\n');
console.log('Extracted feed validation and pack planning into one shared implementation; PC adapters retain I/O.');
