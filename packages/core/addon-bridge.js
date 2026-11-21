const {EventEmitter}=require('events');
const normalize=name=>name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
class AddonBridge extends EventEmitter{
  constructor({engine,loadKeys,verifyIdentity,nonce,checkTransport=async()=>{}}){
    super();Object.assign(this,{engine,loadKeys,verifyIdentity,nonce,checkTransport});this.identity=null;this.target='';this.connected=false;this.code='';this.sending=false;this.timer=null;this.generation=0;
    this.engine.on('engine-event',event=>this.receive(event));
    this.engine.on('fault',message=>this.emit('event',{type:'warning',message}));
    this.engine.on('stopped',()=>{this.connected=false;this.target='';this.identity=null;this.cancelVerification();this.emit('event',{type:'account',name:'',connected:false});});
  }
  async login(){
    if(this.loginPromise)return this.loginPromise;
    this.loginPromise=this.authenticate().finally(()=>{this.loginPromise=null;});return this.loginPromise;
  }
  async authenticate(){
    const generation=this.generation;
    await this.checkTransport();
    await this.engine.start();
    const nonce=await this.nonce();if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(nonce))throw new Error('No se pudo preparar el desafío de identidad.');let proof;
    try{proof=await this.engine.request('identity_proof',{payload:nonce},900000);}
    catch(error){
      if(error.code!=='VOICE_ENGINE_REQUEST_FAILED'||error.command!=='identity_proof'||generation!==this.generation)throw error;
      const session=await this.engine.request('ping');
      if(!session?.savedSignIn||generation!==this.generation)throw error;
      this.emit('event',{type:'account-retry'});
      proof=await this.engine.request('identity_proof',{payload:nonce},900000);
    }
    const identity=await this.verifyIdentity(proof,nonce,await this.loadKeys());
    if(generation!==this.generation)throw new Error('Conexión cancelada.');
    this.identity=identity;this.emit('event',{type:'account',name:identity.name,connected:true});return {name:identity.name};
  }
  async start(host,port){
    if(!this.identity)throw new Error('Conecta tu cuenta Microsoft primero.');
    this.cancelVerification();this.connected=false;this.playerAuthenticated=false;
    this.target=(host.includes(':')?'['+host+']':host)+':'+port;
    const result=await this.engine.request('start_server_proxy',{address:this.target,port:19189},30000);
    if(!Number.isInteger(result?.port)||result.port<1||result.port>65535)throw new Error('El puente local no entregó un puerto válido.');
    this.destination={host:'127.0.0.1',port:result.port};return this.destination;
  }
  matches(host,port){return this.connected&&this.target===(host.includes(':')?'['+host+']':host)+':'+port;}
  waitForServer(timeout=25000){
    if(this.connected)return Promise.resolve(this.destination);
    const generation=this.generation;
    return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);this.engine.off('engine-event',check);this.engine.off('stopped',stopped);if(error)reject(error);else resolve(this.destination);};
      const stopped=()=>finish(new Error('Conexión cancelada.'));
      const check=event=>{
        if(generation!==this.generation)return stopped();
        if(event.event==='server_connected')return finish(this.connected?null:new Error('El servidor confirmó otra cuenta.'));
        if(event.event==='proxy_error'||event.event==='proxy_stopped')return finish(new Error('El puente de Minecraft se desconectó.'));
        if(event.event==='minecraft_authenticated'&&!this.playerAuthenticated)finish(new Error('La cuenta de Minecraft no coincide.'));
      };
      const timer=setTimeout(()=>finish(new Error('El servidor no confirmó la conexión a tiempo.')),timeout);
      this.engine.on('engine-event',check);this.engine.on('stopped',stopped);
    });
  }
  receive(event){
    if(event.event==='auth_code'){
      if(typeof event.userCode==='string'&&/^[A-Z0-9-]{4,24}$/i.test(event.userCode))this.emit('event',{type:'microsoft-code',code:event.userCode});
    }else if(event.event==='minecraft_authenticated'){
      this.playerAuthenticated=!!this.identity&&event.xuid===this.identity.xuid;
      if(!this.playerAuthenticated){this.connected=false;this.engine.request('stop_proxy').catch(()=>{});this.emit('event',{type:'warning',message:'La cuenta de Minecraft no coincide con la cuenta Microsoft conectada.'});}
    }else if(event.event==='server_connected'){
      if(!this.playerAuthenticated||!this.identity||typeof event.gamertag!=='string'||normalize(event.gamertag)!==normalize(this.identity.name)){this.connected=false;this.engine.request('stop_proxy').catch(()=>{});this.emit('event',{type:'warning',message:'El servidor confirmó otra cuenta. Se canceló la verificación.'});return;}
      this.connected=true;this.flush();
    }else if(['minecraft_disconnected','proxy_stopped'].includes(event.event)){this.connected=false;this.playerAuthenticated=false;}
    else if(event.event==='proxy_error')this.emit('event',{type:'warning',message:'No se pudo conectar Minecraft por el puente de voz. Comprueba el servidor y la versión del juego.'});
  }
  verify(code){
    if(typeof code!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(code))throw new Error('Código de voz inválido.');
    this.code=code;this.deadline=Date.now()+60000;this.flush();
  }
  async flush(){
    if(!this.connected||!this.code||this.sending)return;
    const code=this.code,generation=this.generation;this.sending=true;
    try{
      const result=await this.engine.request('send_command',{payload:'/vcmc:verify "'+code+'"'});
      if(generation!==this.generation||this.code!==code)return;
      if(result?.sent===true){this.code='';this.emit('event',{type:'automatic-verification-sent'});}
      else if(Date.now()<this.deadline){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),500);}
      else{this.code='';this.emit('event',{type:'warning',message:'Minecraft no aceptó la verificación automática. Vuelve a conectar la voz.'});}
    }catch{if(generation===this.generation)this.emit('event',{type:'warning',message:'No se pudo enviar la verificación automática a Minecraft.'});}
    finally{this.sending=false;if(this.code&&this.code!==code)this.flush();}
  }
  cancelVerification(){++this.generation;clearTimeout(this.timer);this.code='';}
  async close(){this.cancelVerification();await this.engine.close();}
  async signOut(){this.cancelVerification();await this.engine.request('sign_out');this.identity=null;this.connected=false;this.target='';this.emit('event',{type:'account',name:'',connected:false});}
}

module.exports={AddonBridge};
