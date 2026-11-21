const {EventEmitter}=require('events');
const {Buffer}=require('buffer');
const wire=require('./relay-protocol');
const ENDPOINT='wss://ws.antoic.com:8443';
function validateOptions(options){
  if(!options||typeof options.name!=='string'||!options.name.trim()||options.name.length>40)throw new Error('Escribe tu gamertag de Minecraft.');
  const name=options.name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();if(!name)throw new Error('Gamertag inválido.');
  if(options.room!==undefined&&typeof options.room!=='string')throw new Error('Sala inválida.');
  const room=options.room?.trim()||'';
  if(!/^[-a-zA-Z0-9_:]{0,120}$/.test(room))throw new Error('Sala inválida.');
  return {name,room};
}
class RelaySession extends EventEmitter{
  constructor({WebSocketImpl,endpoint=ENDPOINT,socketOptions={},platform='fonyx-windows',retryDelay=2000,deviceToken=''}={}){
    super();this.socketOptions=socketOptions;this.platform=platform;this.WebSocket=WebSocketImpl;this.endpoint=endpoint;this.deviceToken=deviceToken;this.retryDelay=retryDelay;this.socket=null;this.timer=null;this.closed=true;this.options=null;this.cache=new Map();this.verified=false;this.generation=0;this.status='Desconectado';this.muted=false;this.deafened=false;this.attempt=0;
  }
  connect(options){this.disconnect();if(!/^[A-Za-z0-9]{32}$/.test(this.deviceToken))throw new Error('No se pudo preparar la identidad local de voz.');this.options={...validateOptions(options),deviceToken:this.deviceToken};this.closed=false;this.attempt=0;this.open();return this.snapshot();}
  async connectReady(options,timeout=12000){
    this.connect(options);
    if(this.snapshot().connected)return this.snapshot();
    return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);this.off('event',listener);if(error){this.disconnect();reject(error);}else resolve(this.snapshot());};
      const listener=event=>{if(event.type==='state'&&event.connected)finish();else if(event.type==='server-error'||event.type==='reset')finish(new Error('No se pudo conectar la voz. Minecraft no se abrió.'));};
      const timer=setTimeout(()=>finish(new Error('El servicio de voz no respondió. Minecraft no se abrió.')),timeout);
      this.on('event',listener);
    });
  }
  snapshot(){return {name:this.options?.name||'',room:this.options?.room||'',status:this.status,connected:this.socket?.readyState===1,verified:this.verified,muted:this.muted,deafened:this.deafened};}
  state(status){this.status=status;this.emit('event',{type:'state',...this.snapshot()});}
  open(){
    const generation=++this.generation;this.verified=false;this.cache.clear();this.state('Conectando con VCMC…');
    const socket=new this.WebSocket(this.endpoint,{...this.socketOptions,maxPayload:1048576,handshakeTimeout:12000,perMessageDeflate:false});this.socket=socket;
    socket.on('open',()=>{if(this.socket!==socket)return;this.state('Esperando verificación de Minecraft');this.send(this.options.room?wire.register(this.options):wire.discover(this.options));this.send(wire.mute(this.muted));this.send(wire.deafen(this.deafened));});
    socket.on('message',(data,binary)=>{
      if(this.socket!==socket||typeof data==='string'||(binary===false))return;
      try{
        const event=wire.decode(new Uint8Array(data),this.cache);
        if(event.type==='room-linked'){
          if(!/^[-a-zA-Z0-9_:]{1,120}$/.test(event.value))throw new Error('Sala remota inválida.');
          this.options.room=event.value;this.send(wire.register(this.options));this.sendSettings();this.state('Sala encontrada. Esperando verificación');
        }else if(event.type==='verified'){this.verified=true;this.state('Conectado a la voz');this.sendSettings();}
        else if(event.type==='settings-request')this.sendSettings();
        else if(event.type==='verification-required'){if(!/^[A-Za-z0-9_-]{1,128}$/.test(event.value))throw new Error('Código de verificación inválido.');this.verified=false;this.state('Verifica tu cuenta en Minecraft');}
        else if(event.type==='peer-left')this.cache.delete(event.value.toLowerCase());
        else if(event.type==='self-mute')this.muted=event.value;
        else if(event.type==='self-deafen')this.deafened=event.value;
        else if(event.type==='server-error'){this.closed=true;this.state('VCMC rechazó la conexión: '+event.value);socket.close();}
        if(event.type==='unported')return this.emit('event',{type:'unsupported',opcode:event.opcode});
        if(event.type==='signal'&&!this.verified)return;
        this.emit('event',event);
      }catch{this.emit('event',{type:'warning',message:'VCMC envió un paquete que no se pudo interpretar.'});}
    });
    socket.on('error',()=>{if(this.socket===socket)this.state('No se pudo conectar con VCMC. Revisa tu conexión.');});
    socket.on('close',(code,reason)=>{
      if(this.socket!==socket)return;this.socket=null;this.verified=false;this.cache.clear();this.emit('event',{type:'reset'});
      if(this.closed)return;
      if(code===1008){this.closed=true;this.state('VCMC rechazó la conexión');this.emit('event',{type:'server-error',value:'La sesión no fue aceptada. Comprueba el gamertag y la sala.'});return;}
      this.state('Reconectando con VCMC…');this.timer=setTimeout(()=>{if(!this.closed&&generation===this.generation)this.open();},Math.min(30000,this.retryDelay*2**this.attempt++));
    });
  }
  send(buffer){if(!this.socket||this.socket.readyState!==1)throw new Error('La conexión de voz no está disponible.');this.socket.send(buffer);}
  sendSettings(){this.send(wire.settings({platform:this.platform,globalVolume:1,maxPlayers:10,audioRadius:15,spatialIntensity:.7,monoAudio:false,noiseSuppression:true,language:'es',peerVolumes:{},externalAudioCategoryVolumes:{}}));}
  signal(peer,payload){
    if(!this.verified)throw new Error('Verifica tu cuenta de Minecraft antes de transmitir.');
    if(typeof peer!=='string'||peer===this.options.name||!this.cache.has(peer))throw new Error('El jugador ya no está en la sala de voz.');
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||Buffer.byteLength(JSON.stringify(payload))>131072)throw new Error('Señal de voz inválida.');
    this.send(wire.signal(peer,payload));
  }
  controls({muted,deafened}){if(typeof muted!=='boolean'||typeof deafened!=='boolean')throw new Error('Controles de voz inválidos.');this.muted=muted;this.deafened=deafened;if(this.socket?.readyState===1){this.send(wire.mute(muted));this.send(wire.deafen(deafened));}}
  level(value){if(this.verified&&this.socket?.readyState===1)this.send(wire.level(this.muted||this.deafened?0:value));}
  disconnect(){this.closed=true;++this.generation;clearTimeout(this.timer);this.timer=null;const old=this.socket;this.socket=null;if(old){old.removeAllListeners();old.on('error',()=>{});old.terminate();}this.verified=false;this.cache.clear();this.state('Desconectado');this.emit('event',{type:'reset'});}
}
module.exports={RelaySession,validateOptions};
