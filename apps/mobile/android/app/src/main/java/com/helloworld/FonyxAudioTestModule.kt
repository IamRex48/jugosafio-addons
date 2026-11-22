package studios.fonyx.launcher

import android.Manifest
import android.content.pm.PackageManager
import android.media.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors
import kotlin.math.*

class FonyxAudioTestModule(context:ReactApplicationContext):ReactContextBaseJavaModule(context),LifecycleEventListener {
    private val executor=Executors.newSingleThreadExecutor()
    @Volatile private var running=false
    @Volatile private var recorder:AudioRecord?=null
    @Volatile private var player:AudioTrack?=null
    init { context.addLifecycleEventListener(this) }
    override fun getName()="FonyxAudioTest"
    private fun emit(level:Int,active:Boolean,input:String="") {
        if(reactApplicationContext.hasActiveReactInstance())reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("FonyxAudioTestEvent",Arguments.createMap().apply { putInt("level",level);putBoolean("active",active);putString("input",input) })
    }
    private fun stopCapture() {
        running=false
        try { recorder?.stop() } catch(_:Exception) {}
        try { player?.pause() } catch(_:Exception) {}
    }
    @ReactMethod fun microphone(promise:Promise) {
        if(reactApplicationContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { promise.reject("AUDIO_PERMISSION","Permite el micrófono para probarlo.");return }
        if(running||FonyxVoiceService.instance!=null) { promise.reject("AUDIO_BUSY","Desconecta la voz antes de probar el audio.");return }
        running=true
        executor.execute {
            var started=false
            try {
                val size=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
                check(size>0)
                val record=AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC).setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()).setBufferSizeInBytes(maxOf(size,3200)).build()
                recorder=record
                check(record.state==AudioRecord.STATE_INITIALIZED)
                if(!running) { promise.reject("AUDIO_CANCELLED","Prueba cancelada.");return@execute }
                record.startRecording();check(record.recordingState==AudioRecord.RECORDSTATE_RECORDING)
                started=true;promise.resolve(true)
                val samples=ShortArray(1600);val deadline=android.os.SystemClock.uptimeMillis()+10000
                while(running&&android.os.SystemClock.uptimeMillis()<deadline) {
                    val read=record.read(samples,0,samples.size)
                    if(read<0)break
                    emit(microphoneLevel(samples,read),true,record.routedDevice?.productName?.toString()?:"Predeterminado del sistema")
                }
            } catch(_:Exception) { if(!started)promise.reject("AUDIO_MICROPHONE","No se pudo abrir el micrófono. Comprueba el permiso y los dispositivos conectados.") }
            finally { running=false;try { recorder?.release() } catch(_:Exception) {};recorder=null;emit(0,false) }
        }
    }
    @ReactMethod fun output(promise:Promise) {
        if(running||FonyxVoiceService.instance!=null) { promise.reject("AUDIO_BUSY","Detén la prueba de micrófono antes de escuchar la salida.");return }
        executor.execute {
            try {
                val samples=ShortArray(24000) { i->(sin(2*PI*440*i/48000)*3276*minOf(1.0,i/240.0,(23999-i)/240.0)).toInt().toShort() }
                val track=AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setAudioFormat(AudioFormat.Builder().setSampleRate(48000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()).setBufferSizeInBytes(samples.size*2).setTransferMode(AudioTrack.MODE_STATIC).build()
                player=track;check(track.state!=AudioTrack.STATE_UNINITIALIZED)
                check(track.write(samples,0,samples.size)==samples.size);track.play()
                Thread.sleep(600);promise.resolve(track.routedDevice?.productName?.toString()?:"Predeterminado del sistema")
            } catch(_:Exception) { promise.reject("AUDIO_OUTPUT","No se pudo reproducir la prueba. Comprueba el volumen multimedia del dispositivo.") }
            finally { try { player?.release() } catch(_:Exception) {};player=null }
        }
    }
    @ReactMethod fun stop(promise:Promise) { stopCapture();executor.execute { promise.resolve(true) } }
    @ReactMethod fun addListener(name:String) {}
    @ReactMethod fun removeListeners(count:Double) {}
    override fun onHostResume() {}
    override fun onHostPause() { stopCapture() }
    override fun onHostDestroy() { stopCapture() }
    override fun invalidate() { stopCapture();reactApplicationContext.removeLifecycleEventListener(this);executor.shutdown();super.invalidate() }
}

internal fun microphoneLevel(samples:ShortArray,count:Int):Int {
    if(count<=0)return 0
    var sum=0.0
    for(i in 0 until count) { val value=samples[i]/32768.0;sum+=value*value }
    return (sqrt(sum/count)*300).roundToInt().coerceIn(0,100)
}
