package studios.fonyx.launcher

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import studios.fonyx.auth.accountengine.Accountengine
import studios.fonyx.auth.accountengine.Listener
import java.util.concurrent.Executors

class FonyxAccountModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val executor = Executors.newSingleThreadExecutor()
    private val engine by lazy { Accountengine.new_(AccountVault(reactApplicationContext), object : Listener {
        override fun authCode(code: String) {
            if (reactApplicationContext.hasActiveReactInstance()) {
                val event = Arguments.createMap().apply { putString("event", "auth_code"); putString("userCode", code) }
                reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("FonyxAccountEvent", event)
            }
        }
    }) }
    override fun getName() = "FonyxAccount"
    @ReactMethod fun proof(nonce: String, promise: Promise) { executor.execute {
        try { promise.resolve(engine.proof(nonce)) } catch (error: Exception) { promise.reject("IDENTITY_PROOF", accountFailureMessage(error.message)) }
    } }
    @ReactMethod fun copyCode(code: String, promise: Promise) {
        if(!Regex("[A-Za-z0-9-]{4,24}").matches(code)) { promise.reject("ACCOUNT_CODE", "No hay un código de Microsoft vigente.");return }
        try {
            val clipboard=reactApplicationContext.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Microsoft",code));promise.resolve(true)
        } catch (_: Exception) { promise.reject("ACCOUNT_CODE","No se pudo copiar el código de Microsoft.") }
    }
    @ReactMethod fun savedSignIn(promise: Promise) { executor.execute { try { promise.resolve(engine.savedSignIn()) } catch (_: Exception) { promise.resolve(false) } } }
    @ReactMethod fun cancel(promise: Promise) { engine.cancel(); promise.resolve(true) }
    @ReactMethod fun signOut(promise: Promise) { engine.cancel(); executor.execute {
        try { engine.signOut(); promise.resolve(true) } catch (_: Exception) { promise.reject("SIGN_OUT", "No se pudo cerrar la sesión guardada.") }
    } }
    @ReactMethod fun addListener(name: String) { }
    @ReactMethod fun removeListeners(count: Double) { }
    override fun invalidate() { engine.cancel(); executor.shutdownNow(); super.invalidate() }
}

internal fun accountFailureMessage(message:String?):String {
    val stages=listOf("Microsoft","Xbox Live","la clave de sesión","los servicios de Minecraft","Minecraft","la clave de identidad","la identidad de Minecraft")
    val allowed=stages.map { "No se pudo completar la conexión con $it." }+listOf("Desafío de identidad inválido.","Conexión cancelada.","No se pudo abrir la sesión cifrada.","La sesión guardada no es válida.","No se pudo guardar la sesión cifrada.","No se pudo renovar la sesión guardada.","Microsoft necesita confirmar tu sesión.","Servicio de identidad de Minecraft inválido.")
    return message?.takeIf { it in allowed }?:"No se pudo completar la identidad de Microsoft."
}
