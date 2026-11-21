const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function buildStamp(){
 const files=[];function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())scan(file);else if(/\.(js|json)$/.test(item.name))files.push(file);}}
 scan(path.join(root,'packages/core'));
 const hash=crypto.createHash('sha256');
 for(const file of files.sort()){hash.update(path.relative(root,file).split(path.sep).join('/')+'\0');hash.update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')+'\0');}
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
 const ui=crypto.createHash('sha256');
 function scanUi(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const file=path.join(dir,entry.name);if(entry.isDirectory())scanUi(file);else{ui.update(path.relative(root,file).split(path.sep).join('/')+'\0');ui.update(/\.(js|jsx|json)$/.test(file)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(file));ui.update('\0');}}}
 scanUi(path.join(root,'packages/ui'));
 return {version:require('../package.json').version,commit,sharedCoreSha256:hash.digest('hex'),sharedUiSha256:ui.digest('hex')};
}
if(require.main===module){const target=path.join(root,'apps/mobile/android/app/src/main/assets/shared-core-build.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(buildStamp(),null,2)+'\n');console.log(JSON.stringify(buildStamp()));}
module.exports={buildStamp};
