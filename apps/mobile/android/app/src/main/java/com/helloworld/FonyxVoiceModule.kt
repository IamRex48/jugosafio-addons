package studios.fonyx.launcher

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.oney.WebRTCModule.WebRTCModule
import java.security.SecureRandom

class FonyxVoiceModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    @Volatile private var microphone = ""
    init {
        FonyxVoiceService.dispatch = { name, value -> emit(name, value) }
        FonyxVoiceService.volumeChanged = { value ->
            if (reactApplicationContext.hasActiveReactInstance()) reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("FonyxVoiceEvent", Arguments.createMap().apply { putString("type", "volume"); putDouble("value", value) })
        }
        FonyxVoiceService.stopMicrophone = {
            if (microphone.isNotEmpty()) {
                val rtc = reactApplicationContext.getNativeModule(WebRTCModule::class.java)
                rtc?.mediaStreamTrackSetEnabled(-1, microphone, false); rtc?.mediaStreamTrackRelease(microphone); microphone = ""
            }
        }
    }
    override fun getName() = "FonyxVoice"
    @ReactMethod fun copyCode(command: String, promise: Promise) {
        if(!Regex("/vcmc:verify \"[A-Za-z0-9_-]{1,128}\"").matches(command)) { promise.reject("VOICE_CODE", "No hay un código de verificación vigente."); return }
        try {
            val clipboard = reactApplicationContext.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Verificación de voz", command)); promise.resolve(true)
        } catch (_: Exception) { promise.reject("VOICE_CODE", "No se pudo copiar el comando de verificación.") }
    }
    private fun emit(name: String, value: Boolean) {
        if (reactApplicationContext.hasActiveReactInstance()) reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("FonyxVoiceEvent", Arguments.createMap().apply { putString("type", name); putBoolean("value", value) })
    }
    @ReactMethod fun deviceToken(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("voice-device", 0)
        var token = prefs.getString("token", "")!!
        if (!Regex("[A-Za-z0-9]{32}").matches(token)) {
            val random = SecureRandom(); val alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            token = (0 until 32).map { alphabet[random.nextInt(alphabet.length)] }.joinToString("")
            if (!prefs.edit().putString("token", token).commit()) { promise.reject("VOICE_DEVICE", "No se pudo preparar la identidad local de voz."); return }
        }
        promise.resolve(token)
    }
    @ReactMethod fun overlayPermission(promise: Promise) {
        if (Settings.canDrawOverlays(reactApplicationContext)) { promise.resolve(true); return }
        try { reactApplicationContext.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:"+reactApplicationContext.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); promise.resolve(false) }
        catch (_: Exception) { promise.reject("OVERLAY_PERMISSION", "No se pudo abrir el permiso de burbuja.") }
    }
    @ReactMethod fun start(promise: Promise) { reactApplicationContext.runOnUiQueueThread {
        try {
            check(reactApplicationContext.currentActivity?.hasWindowFocus() == true) { "Abre Fonyx para iniciar el micrófono." }
            check(ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Permite el micrófono para conectar la voz." }
            ContextCompat.startForegroundService(reactApplicationContext, Intent(reactApplicationContext, FonyxVoiceService::class.java)); promise.resolve(true)
        } catch (error: Exception) { promise.reject("VOICE_START", error.message) }
    } }
    @ReactMethod fun track(id: String, promise: Promise) { microphone = id; promise.resolve(true) }
    @ReactMethod fun update(muted: Boolean, deafened: Boolean, verified: Boolean, speaking: Boolean) { FonyxVoiceService.instance?.update(muted, deafened, verified, speaking) }
    @ReactMethod fun stop(promise: Promise) { reactApplicationContext.runOnUiQueueThread {
        FonyxVoiceService.stopMicrophone?.invoke()
        reactApplicationContext.stopService(Intent(reactApplicationContext, FonyxVoiceService::class.java))
        val deadline = android.os.SystemClock.uptimeMillis() + 3000
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        val wait = object : Runnable { override fun run() {
            if (FonyxVoiceService.instance == null) promise.resolve(true)
            else if (android.os.SystemClock.uptimeMillis() >= deadline) promise.reject("VOICE_STOP", "No se pudo detener el servicio de voz.")
            else handler.postDelayed(this, 25)
        } }
        handler.post(wait)
    } }
    @ReactMethod fun addListener(name: String) { }
    @ReactMethod fun removeListeners(count: Double) { }
    override fun invalidate() { FonyxVoiceService.stopMicrophone?.invoke(); reactApplicationContext.stopService(Intent(reactApplicationContext, FonyxVoiceService::class.java)); FonyxVoiceService.dispatch = null; FonyxVoiceService.volumeChanged = null; FonyxVoiceService.stopMicrophone = null; super.invalidate() }
}
