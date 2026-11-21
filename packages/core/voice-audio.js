(function(root){
  function spatial(self,peer,yaw=0,radius=15,intensity=.7){
    if(!self||self.dimension!==peer.dimension)return {gain:0,pan:0,distance:Infinity};
    const dx=peer.x-self.x,dy=peer.y-self.y,dz=peer.z-self.z,distance=Math.hypot(dx,dy,dz),horizontal=Math.hypot(dx,dz),angle=yaw*Math.PI/180;
    return {gain:Math.max(0,1-distance/radius),pan:horizontal<.001?0:Math.max(-1,Math.min(1,(-dx*Math.cos(angle)-dz*Math.sin(angle))/horizontal*intensity)),distance};
  }
  class NativeVoiceAudio{
    constructor({sendSignal,onChange=()=>{},onWarning=()=>{},onLevel=()=>{},media=root.navigator?.mediaDevices,Peer=root.RTCPeerConnection,Context=root.AudioContext,Stream=root.MediaStream,uuid=()=>root.crypto.randomUUID()}={}){
      this.uuid=uuid;this.sendSignal=sendSignal;this.onChange=onChange;this.onWarning=onWarning;this.onLevel=onLevel;this.media=media;this.Peer=Peer;this.Context=Context;this.Stream=Stream;
      this.peers=new Map();this.positions=[];this.yaw={};this.radius=15;this.intensity=.7;this.volume=1;this.muted=false;this.deafened=false;this.forcedMute=false;this.forcedDeafen=false;this.verified=false;this.active=false;this.generation=0;this.pushToTalk=false;this.pttHeld=false;
    }
    async start({name,inputId='',outputId=''}){
      await this.stop();const generation=++this.generation;this.name=name;this.active=true;
      try{
        const stream=await this.media.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(inputId?{deviceId:{exact:inputId}}:{})}});
        if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
        this.stream=stream;this.context=new this.Context();await this.context.resume();await this.setOutput(outputId);
        this.master=this.context.createGain();this.master.connect(this.context.destination);this.master.gain.value=this.volume;
        this.meter=this.context.createAnalyser();this.meter.fftSize=512;this.micSource=this.context.createMediaStreamSource(stream);this.micSource.connect(this.meter);const samples=new Uint8Array(512);
        this.meterTimer=setInterval(()=>{if(!this.active)return;this.meter.getByteTimeDomainData(samples);let sum=0;for(const v of samples)sum+=((v-128)/128)**2;const level=this.canTransmit()?Math.min(100,Math.round(Math.sqrt(sum/samples.length)*300)):0;this.onLevel(level);},200);
        this.applyControls();this.onChange();
      }catch(error){await this.stop();throw error;}
    }
    canTransmit(){return this.verified&&(!this.pushToTalk||this.pttHeld)&&!this.muted&&!this.deafened&&!this.forcedMute&&!this.forcedDeafen;}
    applyControls(){if(this.stream)for(const track of this.stream.getAudioTracks())track.enabled=this.canTransmit();if(this.master)this.master.gain.value=this.deafened||this.forcedDeafen?0:this.volume;this.onChange();}
    setVerified(value){this.verified=value;this.applyControls();if(!value)this.resetPeers();else this.updatePositions(this.positions);}
    setControls(values){Object.assign(this,values);this.applyControls();}
    async setOutput(outputId=''){
      if(!this.context)return;
      if(this.context.setSinkId)await this.context.setSinkId(outputId);
      else if(outputId)throw new Error('No se pudo seleccionar la salida de audio. Elige Predeterminado del sistema.');
    }
    async setInput(inputId){
      if(!this.active||!this.stream)return;
      const generation=this.generation,stream=await this.media.getUserMedia({video:false,audio:{...(inputId?{deviceId:{exact:inputId}}:{}),echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      try{
        if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
        const track=stream.getAudioTracks()[0];track.enabled=this.canTransmit();
        const senders=[...this.peers.values()].map(p=>p.sender),oldTrack=this.stream.getAudioTracks()[0];
        const results=await Promise.allSettled(senders.map(sender=>sender.replaceTrack(track)));
        if(results.some(result=>result.status==='rejected')||generation!==this.generation){await Promise.allSettled(senders.map(sender=>sender.replaceTrack(oldTrack)));throw new Error('No se pudo cambiar el micrófono.');}
        const old=this.stream;this.stream=stream;this.micSource.disconnect();this.micSource=this.context.createMediaStreamSource(stream);this.micSource.connect(this.meter);old.getTracks().forEach(t=>t.stop());
      }catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
    }
    updatePositions(players){
      this.positions=players;if(!this.active||!this.verified)return;
      const self=players.find(p=>p.name===this.name),ordered=players.filter(p=>p.name!==this.name).map(p=>({...p,...spatial(self,p,this.yaw[this.name]||0,this.radius,this.intensity)})).filter(p=>p.gain>0).sort((a,b)=>a.distance-b.distance).slice(0,10),wanted=new Set(ordered.map(p=>p.name));
      for(const name of this.peers.keys())if(!wanted.has(name))this.remove(name);
      for(const player of ordered){const peer=this.ensure(player.name);peer.spatial=player;this.applySpatial(peer,player);}
      this.onChange();
    }
    ensure(name){
      if(this.peers.has(name))return this.peers.get(name);
      if(!this.active||!this.verified||!this.stream)throw new Error('La voz todavía no está verificada.');
      const pc=new this.Peer({iceServers:[{urls:'stun:stun.l.google.com:19302'}],bundlePolicy:'max-bundle'}),peer={pc,name,id:'',makingOffer:false,ignoreOffer:false,candidates:[],spatial:{gain:0,pan:0}};
      this.peers.set(name,peer);peer.sender=pc.addTrack(this.stream.getAudioTracks()[0],this.stream);
      const send=payload=>Promise.resolve(this.sendSignal(name,payload)).catch(()=>this.onWarning('No se pudo enviar una señal de voz.'));
      pc.onicecandidate=e=>{if(e.candidate&&this.peers.get(name)===peer)send({...e.candidate.toJSON(),negotiationId:peer.id});};
      pc.onnegotiationneeded=async()=>{
        if(this.name>=name||this.peers.get(name)!==peer||pc.signalingState!=='stable')return;
        try{peer.makingOffer=true;peer.id=this.uuid();await pc.setLocalDescription();await send({...pc.localDescription.toJSON(),isOffer:pc.localDescription.type==='offer',negotiationId:peer.id});}catch{this.onWarning('No se pudo negociar la voz con '+name+'.');}finally{peer.makingOffer=false;}
      };
      pc.ontrack=e=>{
        if(this.peers.get(name)!==peer||e.track.kind!=='audio')return;
        const stream=e.streams[0]||new this.Stream([e.track]);peer.source?.disconnect();peer.gain?.disconnect();peer.pan?.disconnect();
        this.attachRemote(peer,stream);
      };
      const channel=dc=>{peer.channel=dc;dc.onmessage=e=>{if(e.data==='PING'&&dc.readyState==='open')dc.send('PONG');};dc.onopen=()=>{peer.ping=setInterval(()=>{if(dc.readyState==='open')dc.send('PING');},2500);};};
      pc.ondatachannel=e=>{if(e.channel.label==='vcmc_ping')channel(e.channel);};if(this.name<name)channel(pc.createDataChannel('vcmc_ping'));
      pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){this.remove(name);this.onWarning('Se perdió la voz con '+name+'.');}this.onChange();};
      return peer;
    }
    applySpatial(peer,player){if(peer.gain){peer.gain.gain.setTargetAtTime(player.gain,this.context.currentTime,.08);peer.pan.pan.setTargetAtTime(player.pan,this.context.currentTime,.08);}}
    attachRemote(peer,stream){
        // Chromium needs a playing media element to decode remote WebRTC audio for Web Audio.
        if(root.document){peer.audio?.pause();peer.audio=root.document.createElement('audio');peer.audio.muted=true;peer.audio.srcObject=stream;peer.audio.play().catch(()=>this.onWarning('Pulsa Conectar otra vez para activar el audio.'));}
        peer.source=this.context.createMediaStreamSource(stream);peer.gain=this.context.createGain();peer.pan=this.context.createStereoPanner();peer.gain.gain.value=peer.spatial.gain;peer.pan.pan.value=peer.spatial.pan;peer.source.connect(peer.gain);peer.gain.connect(peer.pan);peer.pan.connect(this.master);this.onChange();
    }
    async receive(name,payload){
      if(!this.active||!this.verified||!this.positions.some(p=>p.name===name))return;
      if(spatial(this.positions.find(p=>p.name===this.name),this.positions.find(p=>p.name===name),0,this.radius).gain<=0)return;
      const peer=this.ensure(name),pc=peer.pc;
      try{
        if(payload.candidate!==undefined){
          if(peer.ignoreOffer)return;
          if(payload.negotiationId&&peer.id&&payload.negotiationId!==peer.id)return;
          const candidate={candidate:payload.candidate,sdpMid:payload.sdpMid??null,sdpMLineIndex:payload.sdpMLineIndex??null};
          if(pc.remoteDescription)await pc.addIceCandidate(candidate);else if(peer.candidates.length<128)peer.candidates.push(candidate);return;
        }
        if(payload.rejected){this.remove(name);return;}
        if(!['offer','answer'].includes(payload.type)||typeof payload.sdp!=='string')return;
        const collision=payload.type==='offer'&&(peer.makingOffer||pc.signalingState!=='stable');
        peer.ignoreOffer=collision&&this.name<name;if(peer.ignoreOffer)return;
        if(payload.type==='answer'&&pc.signalingState!=='have-local-offer')return;
        if(payload.type==='offer')peer.id=payload.negotiationId||'';
        await pc.setRemoteDescription({type:payload.type,sdp:payload.sdp});
        for(const candidate of peer.candidates)await pc.addIceCandidate(candidate);peer.candidates=[];
        if(payload.type==='offer'){await pc.setLocalDescription();await this.sendSignal(name,{...pc.localDescription.toJSON(),isOffer:false,negotiationId:peer.id});}
      }catch{this.onWarning('No se pudo establecer audio con '+name+'.');}
    }
    remove(name){const p=this.peers.get(name);if(!p)return;this.peers.delete(name);clearInterval(p.ping);if(p.audio){p.audio.pause();p.audio.srcObject=null;}p.source?.disconnect();p.gain?.disconnect();p.pan?.disconnect();p.channel?.close();p.pc.close();}
    resetPeers(){for(const name of [...this.peers.keys()])this.remove(name);this.onChange();}
    async stop(){++this.generation;this.active=false;this.verified=false;clearInterval(this.meterTimer);this.resetPeers();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.micSource?.disconnect();if(this.context){const context=this.context;this.context=null;await context.close().catch(()=>{});}this.forcedMute=false;this.forcedDeafen=false;}
  }
  const exports={NativeVoiceAudio,spatial};if(typeof module==='object'&&module.exports)module.exports=exports;else root.FonyxVoiceAudioCore=exports;
})(globalThis);
