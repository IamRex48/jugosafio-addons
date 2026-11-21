const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar');
const {buildStamp}=require('./build-stamp.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});
const stage=fs.mkdtempSync(path.join(out,'desktop-payload-'));
for(const relative of ['src','assets','package.json']){
 const target=path.join(stage,'apps/desktop',relative);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.cpSync(path.join(root,'apps/desktop',relative),target,{recursive:true});
}
fs.cpSync(path.join(root,'packages/core'),path.join(stage,'packages/core'),{recursive:true});
fs.cpSync(path.join(root,'node_modules'),path.join(stage,'node_modules'),{recursive:true,filter:file=>path.basename(file)!=='.bin'});
fs.copyFileSync(path.join(root,'apps/desktop/launcher-content.json'),path.join(stage,'launcher-content.json'));
fs.mkdirSync(path.join(stage,'assets'));fs.copyFileSync(path.join(root,'apps/desktop/assets/icon.ico'),path.join(stage,'assets/icon.ico'));
const {version}=require('../package.json');
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'fonyx-launcher',version,main:'apps/desktop/src/main.js',private:true},null,2));
fs.writeFileSync(path.join(stage,'shared-core-build.json'),JSON.stringify(buildStamp(),null,2)+'\n');
asar.createPackage(stage,path.join(out,'desktop-app.asar')).then(()=>{
 assert(asar.statFile(path.join(out,'desktop-app.asar'),path.join('packages','core','content.js')).size>0);
 assert(JSON.parse(asar.extractFile(path.join(out,'desktop-app.asar'),'package.json')).version===version);
 console.log('Built desktop-app.asar from the shared workspace; native Windows helpers remain external and unchanged.');
}).catch(error=>{console.error(error.message);process.exitCode=1;});
