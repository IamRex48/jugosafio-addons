const {EventEmitter}=require('events');
function socketAdapter(NativeWebSocket){
 return class NativeSocket extends EventEmitter{
  constructor(url,options={}){
   super();this.native=new NativeWebSocket(url);this.native.binaryType='arraybuffer';
   const timer=setTimeout(()=>{this.emit('error',new Error('El servicio de voz no respondió a tiempo.'));this.native.close();},options.handshakeTimeout||12000);
   this.native.addEventListener('open',()=>{clearTimeout(timer);this.emit('open');});
   this.native.addEventListener('error',event=>{clearTimeout(timer);this.emit('error',event);});
   this.native.addEventListener('close',event=>{clearTimeout(timer);this.emit('close',event.code,event.reason);});
   this.native.addEventListener('message',event=>{
    const data=event.data;
    if(typeof data==='string'){this.emit('message',data,false);return;}
    const bytes=data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):null;
    if(!bytes||bytes.length>(options.maxPayload||1048576)){this.native.close(4009,'Paquete de voz inválido.');return;}
    this.emit('message',bytes,true);
   });
  }
  get readyState(){return this.native.readyState;}
  send(value){this.native.send(ArrayBuffer.isView(value)?value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength):value);}
  close(code,reason){this.native.close(code,reason);}
  terminate(){this.native.close();}
 };
}
module.exports={socketAdapter};
