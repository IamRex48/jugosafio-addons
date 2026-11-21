// Isolated render check; no real account, microphone, hotkeys or Discord activity.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..'),output=path.join(root,'verification');fs.mkdirSync(output,{recursive:true});
const archive=process.env.FONYX_SMOKE_ASAR?path.resolve(process.env.FONYX_SMOKE_ASAR):'';
const prefix=archive?'desktop-asar-smoke':'desktop-smoke';
process.env.FONYX_TEST_DATA=path.join(output,'desktop-profile');
fs.mkdirSync(process.env.FONYX_TEST_DATA,{recursive:true});
fs.writeFileSync(path.join(process.env.FONYX_TEST_DATA,'settings.json'),JSON.stringify({discord:false,voiceHotkeys:{enabled:false,mute:'M',deafen:'N',pushToTalk:'V'}}));
require('discord-rpc').Client=class extends EventEmitter{login(){return Promise.resolve();}destroy(){return Promise.resolve();}clearActivity(){}setActivity(){}};
app.getAppPath=()=>archive||path.join(root,'apps/desktop');
BrowserWindow.prototype.show=function(){};
dialog.showErrorBox=(title,message)=>{fs.writeFileSync(path.join(output,'desktop-smoke-failure.json'),JSON.stringify({title,message}));app.exit(1);};
const errors=[];let finished=false;
setTimeout(()=>{if(!finished){fs.writeFileSync(path.join(output,'desktop-smoke-failure.json'),JSON.stringify({error:'Render timed out',errors}));app.exit(1);}},20000);
app.on('browser-window-created',(_,window)=>{
 window.webContents.setBackgroundThrottling(false);
 window.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});
 window.webContents.on('did-finish-load',async()=>{
  try{
   await new Promise(resolve=>setTimeout(resolve,2500));
   const state=await window.webContents.executeJavaScript('({title:document.title,body:document.body.innerText.slice(0,5000),calendar:typeof fonyxCalendar})');
   fs.writeFileSync(path.join(output,prefix+'.png'),(await window.webContents.capturePage()).toPNG());
   fs.writeFileSync(path.join(output,prefix+'.json'),JSON.stringify({state,errors},null,2));
   finished=true;app.exit(errors.length?1:0);
  }catch(error){finished=true;fs.writeFileSync(path.join(output,'desktop-smoke-failure.json'),JSON.stringify({error:error.message,errors}));app.exit(1);}
 });
});
require(archive?path.join(archive,'apps/desktop/src/main.js'):'../apps/desktop/src/main');
