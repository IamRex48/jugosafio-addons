import {NativeEventEmitter,NativeModules} from 'react-native';
import {verifyAccountProof} from './identity-verifier';
const {EventEmitter}=require('events');
const {AddonBridge}=require('../../packages/core/addon-bridge');
const {identityKeys}=require('../../packages/core/identity');
const native=NativeModules.FonyxAccount;
class Engine extends EventEmitter{
 constructor(){super();if(native)this.subscription=new NativeEventEmitter(native).addListener('FonyxAccountEvent',event=>this.emit('engine-event',event));}
 async start(){if(!native)throw new Error('El motor de identidad no está disponible.');}
 async request(command,args={}){
  if(command==='ping')return {savedSignIn:await native.savedSignIn()};
  if(command==='sign_out'){await native.signOut();return {};}
  if(command==='identity_proof'){
   try{return JSON.parse(await native.proof(args.payload));}
   catch(cause){const error=new Error(cause.code==='IDENTITY_PROOF'?cause.message:'La respuesta de identidad no es válida.');error.code=cause.message==='Conexión cancelada.'?'ACCOUNT_CANCELLED':'VOICE_ENGINE_REQUEST_FAILED';error.command=command;throw error;}
  }
  throw new Error('El puente de Minecraft todavía no está disponible en Android.');
 }
 async close(){await native.cancel();this.emit('stopped');}
}
async function json(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Servicio de identidad no disponible.');const text=await response.text();if(text.length>1024*1024)throw new Error('Respuesta de identidad demasiado grande.');return JSON.parse(text);}finally{clearTimeout(timer);}}
class MobileAccountBridge extends AddonBridge {
 async authenticate(){
  if(!native)throw new Error('El motor de identidad no está disponible.');
  await native.begin();
  try{return await super.authenticate();}finally{await native.end();}
 }
}
export const account=new MobileAccountBridge({engine:new Engine(),loadKeys:()=>identityKeys(json),verifyIdentity:verifyAccountProof,nonce:()=>NativeModules.FonyxCrypto.randomNonce()});
export async function copyAccountCode(code){return native.copyCode(code);}
export async function restoreAccount(){
 if(account.identity)return;
 const session=await account.engine.request('ping');
 if(session.savedSignIn)await account.login();
}
