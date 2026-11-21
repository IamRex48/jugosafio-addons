const {spawn}=require('node:child_process');
function bindings(config,micMode){
  if(config?.enabled===false)return [];
  const output=[];
  for(const action of ['mute','deafen',...(micMode==='pushToTalk'?['pushToTalk']:[])]){
    const parts=(config?.[action]||({mute:'M',deafen:'N',pushToTalk:'V'})[action]).toUpperCase().replace(/\s/g,'').split('+');let modifiers=0;
    const name=parts.pop();for(const modifier of parts){const bit=({CTRL:1,CONTROL:1,COMMANDORCONTROL:1,ALT:2,SHIFT:4,WIN:8,SUPER:8})[modifier];if(!bit)throw new Error('Atajo de voz inválido.');modifiers|=bit;}
    const key=/^[A-Z0-9]$/.test(name)?name.charCodeAt(0):/^F([1-9]|1\d|2[0-4])$/.test(name)?111+Number(name.slice(1)):({SPACE:32,TAB:9,ESC:27,ESCAPE:27,UP:38,DOWN:40,LEFT:37,RIGHT:39})[name];
    if(!key||output.some(binding=>binding.key===key&&binding.modifiers===modifiers))throw new Error('Los atajos deben ser válidos y diferentes.');output.push({action,key,modifiers});
  }
  return output;
}
function startKeys(executable,keys,onKey){
  const child=spawn(executable,[JSON.stringify(keys)],{windowsHide:true,stdio:['pipe','pipe','ignore']});let buffer='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>4096){child.kill();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const value=JSON.parse(line);if(keys.some(key=>key.action===value.action)&&typeof value.pressed==='boolean')onKey(value);}catch{}}});
  child.stdin.on('error',()=>{});
  child.on('error',()=>{});child.on('close',()=>onKey({action:'pushToTalk',pressed:false}));return {alive:()=>!!child.pid&&child.exitCode===null&&!child.killed,stop(){child.stdin.end();setTimeout(()=>{if(child.exitCode===null)child.kill();},1000).unref();}};
}
module.exports={bindings,startKeys};
