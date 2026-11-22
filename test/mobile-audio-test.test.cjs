const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('esbuild');
function fixture(granted){
 const calls=[],module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('apps/mobile/audio-test.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:()=>({NativeModules:{FonyxAudioTest:{microphone:async()=>calls.push('mic'),output:async()=>calls.push('output'),stop:async()=>calls.push('stop')}},NativeEventEmitter:class {addListener(){return {remove:()=>calls.push('unsubscribe')};}},PermissionsAndroid:{PERMISSIONS:{RECORD_AUDIO:'microphone'},RESULTS:{GRANTED:'yes'},request:async()=>granted?'yes':'no'}})});
 return {...module.exports,calls};
}
test('audio tests request microphone permission and never capture after refusal',async()=>{
 const denied=fixture(false);await assert.rejects(denied.testMicrophone(),/Permite/);assert.deepEqual(denied.calls,[]);
 const allowed=fixture(true);await allowed.testMicrophone();await allowed.stopAudioTest();await allowed.testOutput();allowed.onAudioTest(()=>{})();assert.deepEqual(allowed.calls,['mic','stop','output','unsubscribe']);
});
