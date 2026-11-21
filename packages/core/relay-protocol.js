const {Buffer}=require('buffer');
function strictUtf8(bytes){const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw new TypeError('The encoded data was not valid for encoding utf-8');return text.charCodeAt(0)===0xfeff?text.slice(1):text;}
// Wire layouts observed in VCMC 2.3.4's published web client; this does not grant room access.
const MAX_FRAME=1048576;
function frame(opcode,payload=Buffer.alloc(0)){
  if(payload.length+1>MAX_FRAME)throw new Error('Mensaje de voz demasiado grande.');
  return Buffer.concat([Buffer.from([opcode]),payload]);
}
function json(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Datos de voz inválidos.');
  return Buffer.from(JSON.stringify(value),'utf8');
}
function signal(peer,payload){
  if(typeof peer!=='string'||!peer.length)throw new Error('Destino de voz inválido.');
  const name=Buffer.from(peer,'utf8');if(name.length>255)throw new Error('Nombre de voz demasiado largo.');
  return frame(2,Buffer.concat([Buffer.from([name.length]),name,json(payload)]));
}
function booleanFrame(opcode,value){if(typeof value!=='boolean')throw new Error('Estado de voz inválido.');return frame(opcode,Buffer.from([Number(value)]));}
function decode(input,cache=new Map()){
  if(!(input instanceof Uint8Array)||!input.length||input.byteLength>MAX_FRAME)throw new Error('Paquete de voz inválido.');
  const data=Buffer.from(input),opcode=data[0];
  const text=offset=>strictUtf8(data.subarray(offset));
  if(opcode===4){
    const v2=data[1]===254,start=v2?2:1;if(data.length<=start)throw new Error('Posiciones incompletas.');
    const count=data[start],players=[];let offset=start+1;
    for(let i=0;i<count;i++){
      if(offset+(v2?2:1)>data.length)throw new Error('Posiciones incompletas.');
      const length=data[offset++],reuse=v2?data[offset++]:0;
      if(!length||offset+length>data.length)throw new Error('Nombre remoto inválido.');
      const name=strictUtf8(data.subarray(offset,offset+length)).toLowerCase();offset+=length;
      if(reuse){if(cache.has(name))players.push(cache.get(name));continue;}
      if(offset+13>data.length)throw new Error('Posición remota incompleta.');
      const player={name,x:data.readFloatLE(offset),y:data.readFloatLE(offset+4),z:data.readFloatLE(offset+8),dimension:data[offset+12]};offset+=13;
      if(![player.x,player.y,player.z].every(Number.isFinite))throw new Error('Posición remota inválida.');
      cache.set(name,player);players.push(player);
    }
    const alive=new Set(players.map(p=>p.name));for(const name of cache.keys())if(!alive.has(name))cache.delete(name);
    return {type:'positions',players};
  }
  if(opcode===20){
    if(data.length<2)throw new Error('Orientación incompleta.');let offset=2;const yaw={};
    for(let i=0;i<data[1];i++){const length=data[offset++];if(!length||offset+length+4>data.length)throw new Error('Orientación inválida.');const name=strictUtf8(data.subarray(offset,offset+length)).toLowerCase();offset+=length;const value=data.readFloatLE(offset);offset+=4;if(!Number.isFinite(value))throw new Error('Orientación inválida.');yaw[name]=value;}
    return {type:'yaw',yaw};
  }
  if(opcode===3){
    if(data.length<3||data.length<=2+data[1])throw new Error('Señal de voz incompleta.');
    const end=2+data[1],peer=strictUtf8(data.subarray(2,end)),payload=JSON.parse(text(end));
    if(!peer||!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Señal de voz inválida.');
    return {type:'signal',peer,payload};
  }
  if([7,19,36,37].includes(opcode)){
    if(data.length!==2||data[1]>1)throw new Error('Estado remoto de voz inválido.');
    return {type:({7:'forced-mute',19:'self-mute',36:'forced-deafen',37:'self-deafen'})[opcode],value:data[1]===1};
  }
  if([12,28].includes(opcode)){
    const value=JSON.parse(text(1));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Configuración de voz inválida.');
    return {type:opcode===12?'settings':'policy',value};
  }
  if([13,15,18,21].includes(opcode))return {type:({13:'verification-required',15:'notice',18:'room-linked',21:'peer-left'})[opcode],value:text(1)};
  if(opcode===14)return {type:'verified'};
  if(opcode===16)return {type:'settings-request'};
  if(opcode===9){if(data.length<2||data.length<2+data[1])throw new Error('Error remoto inválido.');return {type:'server-error',value:strictUtf8(data.subarray(2,2+data[1]))};}
  // Preserve unported frames (groups, SFU, megaphone, SFX, positions) rather than dropping data.
  return {type:'unported',opcode,data};
}
function field(value){if(typeof value!=='string')throw new Error('Campo de voz inválido.');const bytes=Buffer.from(value,'utf8');if(bytes.length>255)throw new Error('Campo de voz demasiado largo.');return Buffer.concat([Buffer.from([bytes.length]),bytes]);}
module.exports={signal,decode,register:({room,name,deviceToken})=>frame(1,Buffer.concat([field(room),field(name),field(deviceToken),Buffer.from([8])])),discover:({name,deviceToken})=>frame(17,Buffer.concat([field(name),field(deviceToken),Buffer.from([1])])),settings:value=>frame(11,json(value)),mute:value=>booleanFrame(6,value),deafen:value=>booleanFrame(35,value),level:value=>{
  if(!Number.isFinite(value))throw new Error('Nivel de voz inválido.');return frame(24,Buffer.from([Math.trunc(Math.max(0,Math.min(100,value)))]));
}};
