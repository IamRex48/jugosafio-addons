package studios.fonyx.launcher

import android.content.Intent
import android.content.ComponentName
import android.net.Uri
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.*
import org.json.JSONObject

class FonyxPlatformModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "FonyxPlatform"
    private val preferences get() = reactApplicationContext.getSharedPreferences("launcher-settings", 0)

    @ReactMethod fun settings(promise: Promise) { promise.resolve(preferences.getString("settings", "{}")) }
    @ReactMethod fun launchMinecraft(address:String,promise:Promise) { reactApplicationContext.runOnUiQueueThread {
        try {
            val component=reactApplicationContext.packageManager.getLaunchIntentForPackage("com.mojang.minecraftpe")?.component?:error("Minecraft no está instalado en este dispositivo.")
            reactApplicationContext.startActivity(minecraftConnectIntent(address,component));promise.resolve(true)
        } catch(error:Exception) { promise.reject("MINECRAFT_CONNECT",error.message?:"No se pudo abrir la conexión con Minecraft.") }
    } }

    @ReactMethod fun saveSettings(value: String, promise: Promise) {
        try {
            require(value.length <= 16384) { "Los ajustes superan el tamaño permitido." }
            val settings = JSONObject(value)
            val booleans = setOf("discord", "trustEvents", "vanillaMenu", "reducedMotion", "trayOnPlay", "userView", "setupComplete")
            val strings = setOf("root", "profile", "voiceInput", "voiceOutput", "voiceMicMode", "loadingStyle")
            for (key in settings.keys()) {
                when {
                    key in booleans -> require(settings.get(key) is Boolean)
                    key in strings -> require(settings.get(key) is String && settings.getString(key).length <= 2048)
                    key == "voiceHotkeys" -> {
                        val keys = settings.getJSONObject(key)
                        require(keys.length() == 4 && keys.get("enabled") is Boolean)
                        for (name in listOf("mute", "deafen", "pushToTalk")) require(keys.get(name) is String && keys.getString(name).length in 1..20)
                    }
                    else -> error("Ajuste no permitido: $key")
                }
            }
            if (settings.has("voiceMicMode")) require(settings.getString("voiceMicMode") in setOf("open", "pushToTalk"))
            if (settings.has("loadingStyle")) require(settings.getString("loadingStyle") in setOf("diamond", "roulette"))
            require(preferences.edit().putString("settings", settings.toString()).commit()) { "No se pudieron guardar los ajustes." }
            promise.resolve(true)
        } catch (error: Exception) { promise.reject("SETTINGS_SAVE", error.message, error) }
    }

    @ReactMethod fun window(action: String, promise: Promise) {
        reactApplicationContext.runOnUiQueueThread {
            try {
                val activity = reactApplicationContext.currentActivity ?: error("La ventana no está disponible.")
                when (action) {
                    "minimize", "close" -> activity.moveTaskToBack(true)
                    "quit" -> activity.finishAndRemoveTask()
                    "maximize" -> WindowInsetsControllerCompat(activity.window, activity.window.decorView).hide(WindowInsetsCompat.Type.systemBars())
                    else -> error("Acción de ventana inválida.")
                }
                promise.resolve(true)
            } catch (error: Exception) { promise.reject("WINDOW", error.message, error) }
        }
    }
}

internal fun minecraftConnectIntent(address:String,component:ComponentName):Intent {
    val uri=Uri.parse(address)
    require(uri.scheme=="minecraft"&&uri.authority=="connect"&&uri.path.isNullOrEmpty()&&uri.fragment==null&&uri.queryParameterNames==setOf("serverUrl","serverPort")) { "El enlace de conexión con Minecraft no es válido." }
    require(Regex("[A-Za-z0-9.:%_-]{1,253}").matches(uri.getQueryParameter("serverUrl")?:"")&&(uri.getQueryParameter("serverPort")?.toIntOrNull()?:0) in 1..65535) { "La dirección o el puerto del servidor no son válidos." }
    require(component.packageName=="com.mojang.minecraftpe")
    return Intent(Intent.ACTION_VIEW,uri).setComponent(component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
}
