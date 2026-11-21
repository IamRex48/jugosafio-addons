const {EventEmitter}=require('node:events');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs/promises');
const commands=new Set(['ping','list_realms','start_proxy','start_server_proxy','identity_proof','send_command','list_players','show_form','show_title','show_message','set_name_tags','set_resource_pack','stop_proxy','sign_out','addon_downlink','wake_addon','ui_action','shutdown']);

// Local JSON-lines protocol confirmed against VCMC's Go engine; no account data enters the renderer.
class ProxyEngine extends EventEmitter {
  constructor({executable,args=[],cacheDir,timeout=15000}){
    super();
    if(!path.isAbsolute(executable)||!path.isAbsolute(cacheDir))throw new Error('El motor y su carpeta de sesión deben usar rutas absolutas.');
    this.executable=executable;this.args=args;this.cacheDir=cacheDir;this.timeout=timeout;
    this.child=null;this.pending=new Map();this.sequence=0;this.buffer='';this.closing=null;
  }
  async start(){
    if(this.child)return;
    await fs.mkdir(this.cacheDir,{recursive:true});
    const child=spawn(this.executable,this.args,{cwd:this.cacheDir,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,VCMC_REALMS_DATA_DIR:this.cacheDir,VCMC_REALMS_AUTH_DIR:this.cacheDir,VCMC_REALMS_CONTROL_PORT:'0',VCMC_REALMS_CONTROL_HOST:'127.0.0.1',VCMC_REALMS_ADVERTISE_HOST:'127.0.0.1',VCMC_REALMS_DIAGNOSTICS:'0'}});
    this.child=child;this.buffer='';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      this.buffer+=chunk;
      if(Buffer.byteLength(this.buffer)>1048576)return this.fail('El motor devolvió un mensaje demasiado grande.');
      let end;
      while((end=this.buffer.indexOf('\n'))!==-1){
        const line=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end+1);if(!line)continue;
        let message;try{message=JSON.parse(line);}catch{return this.fail('El motor devolvió un mensaje inválido.');}
        if(!message||typeof message!=='object'||Array.isArray(message))return this.fail('Respuesta de motor inválida.');
        const pending=this.pending.get(message.id);
        if(pending){clearTimeout(pending.timer);this.pending.delete(message.id);if(message.ok===true)pending.resolve(message.result);else{const error=new Error('El motor no pudo completar '+pending.command+'.');error.code='VOICE_ENGINE_REQUEST_FAILED';error.command=pending.command;pending.reject(error);}}
        else if(typeof message.event==='string')this.emit('engine-event',message);
      }
    });
    // Drain stderr without logging possible authentication details.
    child.stderr.resume();
    child.stdin.on('error',()=>{if(this.child===child)this.fail('Se cerró el canal del motor.');});
    child.once('error',()=>{if(this.child===child)this.fail('No se pudo iniciar el motor local.');});
    child.once('close',()=>{if(this.child!==child)return;this.child=null;this.rejectPending('El motor local se cerró.');this.emit('stopped');});
    try{await this.request('ping');}catch(error){await this.close();throw error;}
  }
  request(command,parameters={},timeout=this.timeout){
    if(!commands.has(command))return Promise.reject(new Error('Comando de voz no permitido.'));
    if(!this.child||this.child.killed)return Promise.reject(new Error('El motor de voz no está iniciado.'));
    if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))return Promise.reject(new Error('Parámetros de voz inválidos.'));
    const id=++this.sequence;let data;
    try{data=JSON.stringify({...parameters,id,command})+'\n';}catch{return Promise.reject(new Error('Parámetros de voz inválidos.'));}
    if(Buffer.byteLength(data)>1048576)return Promise.reject(new Error('Solicitud de voz demasiado grande.'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('El motor tardó demasiado en responder a '+command+'.'));},timeout);
      this.pending.set(id,{resolve,reject,timer,command});
      this.child.stdin.write(data,error=>{if(error){const entry=this.pending.get(id);if(entry){clearTimeout(entry.timer);this.pending.delete(id);reject(new Error('No se pudo enviar la solicitud al motor.'));}}});
    });
  }
  rejectPending(message){for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(new Error(message));}this.pending.clear();}
  fail(message){this.rejectPending(message);if(this.child)this.child.kill();this.emit('fault',message);}
  close(){
    if(this.closing)return this.closing;
    this.closing=this.stop().finally(()=>{this.closing=null;});return this.closing;
  }
  async stop(){
    const child=this.child;if(!child)return;
    // The native engine can keep stdin open after shutdown, so EOF is required too.
    try{await this.request('shutdown',{},1500);}catch{}
    if(child.exitCode!==null){if(this.child===child)this.child=null;this.rejectPending('El motor local se cerró.');return;}
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>child.kill(),1500);
      const deadline=setTimeout(()=>{clearTimeout(timer);reject(new Error('No se pudo confirmar el cierre del motor.'));},5000);
      child.once('close',()=>{clearTimeout(timer);clearTimeout(deadline);resolve();});
      child.stdin.end();
    });
  }
}
module.exports={ProxyEngine};
