package studios.fonyx.launcher

import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.*
import org.json.JSONObject

class FonyxPlatformModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "FonyxPlatform"
    private val preferences get() = reactApplicationContext.getSharedPreferences("launcher-settings", 0)

    @ReactMethod fun settings(promise: Promise) { promise.resolve(preferences.getString("settings", "{}")) }

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
