package studios.fonyx.launcher

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import studios.fonyx.auth.accountengine.Vault

class AccountVault(context: Context) : Vault {
    private val prefs = context.getSharedPreferences("microsoft-session", 0)
    private val alias = "fonyx.microsoft.session.v1"
    private val aad = (context.packageName + ":microsoft-session:v1").toByteArray(Charsets.UTF_8)
    private fun store() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun key(): SecretKey {
        (store().getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        }.generateKey()
    }
    @Synchronized override fun load(): String {
        val raw = prefs.getString("encrypted", null) ?: return ""
        require(raw.length <= 800000) { "Sesión guardada demasiado grande." }
        val envelope = JSONObject(raw)
        require(envelope.getInt("v") == 1)
        val iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)
        require(iv.size == 12)
        val existing = store().getKey(alias, null) as? SecretKey ?: run { clear(); return "" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, existing, GCMParameterSpec(128, iv)); cipher.updateAAD(aad)
        return String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), Charsets.UTF_8)
    }
    @Synchronized override fun save(value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        require(bytes.size <= 512 * 1024) { "Sesión demasiado grande." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(aad)
        val data = cipher.doFinal(bytes)
        val envelope = JSONObject().put("v", 1).put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).put("data", Base64.encodeToString(data, Base64.NO_WRAP))
        check(prefs.edit().putString("encrypted", envelope.toString()).commit()) { "No se pudo guardar la sesión cifrada." }
    }
    @Synchronized override fun clear() {
        check(prefs.edit().remove("encrypted").commit())
        store().deleteEntry(alias)
    }
}
