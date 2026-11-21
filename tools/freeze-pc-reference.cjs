// Freeze only the original validation contracts, never binaries or account data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=process.argv[2];assert(source,'Supply original Fuentes directory');
const destination=path.resolve(__dirname,'../test/reference');fs.mkdirSync(destination,{recursive:true});
const core=fs.readFileSync(path.join(source,'src/core.js'),'utf8'),publish=fs.readFileSync(path.join(source,'src/github-publish.js'),'utf8');
const uuid=/const UUID = ([^;]+);/.exec(core)[1];
const functions=core.slice(core.indexOf('function https(value)'),core.indexOf('async function readJson('));
const plan=publish.slice(publish.indexOf('function packPlan('),publish.indexOf('async function assets('));
assert(functions&&plan);
fs.writeFileSync(path.join(destination,'core.cjs'),`// Frozen beta.3 PC reference. Do not edit to make a test pass.\nconst net=require('node:net');\nconst UUID=${uuid};\n${functions}\n${plan}\nmodule.exports={https,connectUri,validateFeed,validateContent,packPlan};\n`);
fs.copyFileSync(path.join(source,'src/calendar.js'),path.join(destination,'calendar.js'));
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
fs.writeFileSync(path.join(destination,'provenance.json'),JSON.stringify({version:'1.2.15-beta.3',coreSha256:sha(core),publisherSha256:sha(publish)},null,2)+'\n');
