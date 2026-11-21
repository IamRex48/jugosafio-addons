const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),template=path.join(__dirname,'package','template'),dest=path.join(root,'apps','mobile');
assert(!fs.existsSync(dest),'Refuse to overwrite mobile project');fs.mkdirSync(dest,{recursive:true});
for(const n of ['android','babel.config.js'])fs.cpSync(path.join(template,n),path.join(dest,n),{recursive:true});
const files=['android/settings.gradle','android/app/build.gradle','android/app/src/main/res/values/strings.xml','android/app/src/main/java/com/helloworld/MainActivity.kt','android/app/src/main/java/com/helloworld/MainApplication.kt'];
for(const file of files){const p=path.join(dest,file);let text=fs.readFileSync(p,'utf8').replaceAll('com.helloworld','studios.fonyx.launcher').replaceAll('HelloWorld','FonyxLauncher');fs.writeFileSync(p,text);}
fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify({name:'fonyx-mobile',version:require('../package.json').version,private:true,scripts:{start:'react-native start',android:'react-native run-android'},dependencies:{react:'19.2.3','react-native':'0.85.2','react-native-url-polyfill':'3.0.0'},devDependencies:{'@babel/core':'^7.25.2','@babel/runtime':'^7.25.0','@react-native-community/cli':'20.1.0','@react-native-community/cli-platform-android':'20.1.0','@react-native/babel-preset':'0.85.2','@react-native/metro-config':'0.85.2'}},null,2)+'\n');
fs.copyFileSync(path.join(__dirname,'package','LICENSE'),path.join(dest,'TEMPLATE-LICENSE'));
fs.writeFileSync(path.join(dest,'android','local.properties'),'sdk.dir=C:/Program Files/Unity/Hub/Editor/6000.4.0f1/Editor/Data/PlaybackEngines/AndroidPlayer/SDK\n');
console.log('Native Android project prepared from pinned official React Native template.');
