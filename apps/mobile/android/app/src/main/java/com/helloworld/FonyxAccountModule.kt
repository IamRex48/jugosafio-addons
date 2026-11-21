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
        try { promise.resolve(engine.proof(nonce)) } catch (_: Exception) { promise.reject("IDENTITY_PROOF", "No se pudo completar la identidad de Microsoft.") }
    } }
    @ReactMethod fun savedSignIn(promise: Promise) { executor.execute { try { promise.resolve(engine.savedSignIn()) } catch (_: Exception) { promise.resolve(false) } } }
    @ReactMethod fun cancel(promise: Promise) { engine.cancel(); promise.resolve(true) }
    @ReactMethod fun signOut(promise: Promise) { engine.cancel(); executor.execute {
        try { engine.signOut(); promise.resolve(true) } catch (_: Exception) { promise.reject("SIGN_OUT", "No se pudo cerrar la sesión guardada.") }
    } }
    @ReactMethod fun addListener(name: String) { }
    @ReactMethod fun removeListeners(count: Double) { }
    override fun invalidate() { engine.cancel(); executor.shutdownNow(); super.invalidate() }
}
