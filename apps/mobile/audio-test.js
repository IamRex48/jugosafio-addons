import {NativeModules,NativeEventEmitter,PermissionsAndroid} from 'react-native';
const native=NativeModules.FonyxAudioTest,events=new NativeEventEmitter(native);
export function onAudioTest(callback){const subscription=events.addListener('FonyxAudioTestEvent',callback);return()=>subscription.remove();}
export async function testMicrophone(){
 const result=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
 if(result!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('Permite el micrófono para probarlo. Puedes continuar sin hacer la prueba.');
 return native.microphone();
}
export function testOutput(){return native.output();}
export function stopAudioTest(){return native.stop();}
