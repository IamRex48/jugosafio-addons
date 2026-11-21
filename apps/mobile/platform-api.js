import {voiceState,voiceEvents,connectVoice,disconnectVoice,voiceControls} from './voice-runtime';
import {account} from './account';
import {Linking,NativeModules} from 'react-native';
const {initialState,settings:defaults}=require('../../packages/ui/initial-state');
const {loadContent}=require('./content-source');
const platform=NativeModules.FonyxPlatform;
let content=initialState.content,settings={...defaults},loaded=false;
const ok=value=>({ok:true,value});
async function snapshot(){if(platform){const saved=JSON.parse(await platform.settings());settings={...defaults,...saved};}return {...initialState,content,settings,voice:voiceState(),account:{name:account.identity?.name||'',connected:!!account.identity}};}
async function json(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(text.length>2*1024*1024)throw new Error('La publicaciÃ³n supera 2 MB.');return JSON.parse(text);}finally{clearTimeout(timer);}}
export {initialState};
export const api={
 voiceDisconnect:async()=>{await disconnectVoice();return ok(true);},
 voiceControls:async value=>{voiceControls(value);return ok(voiceState());},
 voiceConnect:async options=>{const event=content.events.find(e=>e.id===options.eventId);if(!event)throw new Error('El evento ya no existe.');return ok(await connectVoice(account.identity,event,settings));},
 play:async id=>{const event=content.events.find(e=>e.id===id);if(!event?.enabled)throw new Error('El evento no está disponible.');if(!account.identity)throw new Error('Conecta tu cuenta Microsoft primero.');const {connectUri}=require('../../packages/core/content');const uri=connectUri(event.server,event.port);try{if(event.voiceEnabled)await connectVoice(account.identity,event,settings);await Linking.openURL(uri);return ok(true);}catch(error){await disconnectVoice();throw error;}},
 accountConnect:async()=>{await account.login();return ok(await snapshot());},
 accountCancel:async()=>{await account.close();return ok(true);},
 voiceSignOut:async()=>{await disconnectVoice();await account.signOut();return ok(true);},
 voiceMicrosoft:async()=>{await Linking.openURL('https://microsoft.com/link');return ok(true);},
 onVoice:callback=>{account.on('event',callback);voiceEvents.on('event',callback);return()=>{account.off('event',callback);voiceEvents.off('event',callback);};},
 state:async()=>{if(!loaded){loaded=true;try{content=await loadContent(['https://github.com/IamRex48/jugosafio-addons/releases/latest/download/launcher-content.json'],json);}catch{}}return ok(await snapshot());},
 refreshContent:async()=>{content=await loadContent(['https://github.com/IamRex48/jugosafio-addons/releases/latest/download/launcher-content.json'],json);return ok(await snapshot());},
 saveSettings:async value=>{await platform.saveSettings(JSON.stringify(value));settings=value;voiceControls({pushToTalk:settings.voiceMicMode==='pushToTalk'});return ok(await snapshot());},
 window:async action=>ok(await platform.window(action)),
 social:async key=>{const url={discord:'https://discord.gg/TAHGBktktU',tiktok:'https://www.tiktok.com/@fonyx.studios'}[key];if(!url)throw new Error('Enlace no permitido.');await Linking.openURL(url);return ok(true);},
};
