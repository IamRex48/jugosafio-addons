package studios.fonyx.launcher

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

class FonyxCryptoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "FonyxCrypto"

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun verifyRSA(message: String, jwk: String, signature: String): Boolean {
        return try {
            if (jwk.length > 16384) return false
            val key = JSONObject(jwk)
            key.optString("kty") == "RSA" && IdentityCrypto.verifyRSA(message, key.getString("n"), key.getString("e"), signature)
        } catch (error: Exception) { false }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun verifyEC(key: String, message: String, signature: String): Boolean = IdentityCrypto.verifyEC(key, message, signature)
}
