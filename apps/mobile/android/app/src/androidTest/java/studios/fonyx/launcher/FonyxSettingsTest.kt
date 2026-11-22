package studios.fonyx.launcher

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Promise
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FonyxSettingsTest {
    @Test fun persistsPreferencesButNeverAcceptsCredentialsOrInvalidValues() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences("launcher-settings", 0)
        val original = preferences.getString("settings", null)
        val module = FonyxPlatformModule(BridgeReactContext(context))
        fun save(value: String): String {
            val ready = CountDownLatch(1); var result = ""
            val promise = Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, _ ->
                if (method.name in listOf("resolve", "reject")) { result = method.name; ready.countDown() }; null
            } as Promise
            module.saveSettings(value, promise)
            assertTrue(ready.await(10, TimeUnit.SECONDS)); return result
        }
        try {
            assertEquals("resolve", save("""{"reducedMotion":true,"loadingStyle":"diamond","setupComplete":true}"""))
            assertTrue(JSONObject(preferences.getString("settings", "{}")!!).getBoolean("reducedMotion"))
            assertTrue(JSONObject(preferences.getString("settings", "{}")!!).getBoolean("setupComplete"))
            for (invalid in listOf("""{"access_token":"secret"}""", """{"accountName":"someone else"}""", """{"discord":"yes"}""", """{"loadingStyle":"unknown"}""")) assertEquals("reject", save(invalid))
            assertEquals(3, JSONObject(preferences.getString("settings", "{}")!!).length())
        } finally { preferences.edit().apply { if (original == null) remove("settings") else putString("settings", original) }.commit(); module.invalidate() }
    }
}
