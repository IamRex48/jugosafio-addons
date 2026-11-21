import {NativeModules} from 'react-native';
const {verifyIdentity}=require('../../packages/core/identity');
function crypto(){
 const native=NativeModules.FonyxCrypto;
 if(!native)throw new Error('El verificador de identidad no está disponible.');
 return {verifyRSA:(message,key,signature)=>native.verifyRSA(message,JSON.stringify(key),signature),verifyEC:(key,message,signature)=>native.verifyEC(key,message,signature)};
}
export function verifyAccountProof(proof,nonce,keys){return verifyIdentity(proof,nonce,keys,crypto());}
