import {Linking,NativeModules} from 'react-native';
const {initialState,settings:defaults}=require('../../packages/ui/initial-state');
const {loadContent}=require('./content-source');
const platform=NativeModules.FonyxPlatform;
let content=initialState.content,settings={...defaults},loaded=false;
const ok=value=>({ok:true,value});
async function snapshot(){if(platform){const saved=JSON.parse(await platform.settings());settings={...defaults,...saved};}return {...initialState,content,settings};}
async function json(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(text.length>2*1024*1024)throw new Error('La publicaciÃ³n supera 2 MB.');return JSON.parse(text);}finally{clearTimeout(timer);}}
export {initialState};
export const api={
 state:async()=>{if(!loaded){loaded=true;try{content=await loadContent(['https://github.com/IamRex48/jugosafio-addons/releases/latest/download/launcher-content.json'],json);}catch{}}return ok(await snapshot());},
 refreshContent:async()=>{content=await loadContent(['https://github.com/IamRex48/jugosafio-addons/releases/latest/download/launcher-content.json'],json);return ok(await snapshot());},
 saveSettings:async value=>{await platform.saveSettings(JSON.stringify(value));settings=value;return ok(await snapshot());},
 window:async action=>ok(await platform.window(action)),
 social:async key=>{const url={discord:'https://discord.gg/TAHGBktktU',tiktok:'https://www.tiktok.com/@fonyx.studios'}[key];if(!url)throw new Error('Enlace no permitido.');await Linking.openURL(url);return ok(true);},
};
