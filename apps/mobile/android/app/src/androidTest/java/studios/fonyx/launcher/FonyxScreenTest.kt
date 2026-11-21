package studios.fonyx.launcher

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class FonyxScreenTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()

    private fun find(node: AccessibilityNodeInfo?, matches: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (node == null) return null
        if (matches(node)) return node
        for (index in 0 until node.childCount) { val match = find(node.getChild(index), matches); if (match != null) return match }
        return null
    }

    private fun waitFor(text: String): AccessibilityNodeInfo {
        val deadline = SystemClock.uptimeMillis() + 25000
        while (SystemClock.uptimeMillis() < deadline) {
            val root = instrumentation.uiAutomation.rootInActiveWindow
            // A fresh emulator can show Android's fullscreen tutorial above the application.
            if (find(root) { it.packageName == "android" && it.viewIdResourceName == "android:id/immersive_cling_title" } != null) {
                find(root) { it.packageName == "android" && it.viewIdResourceName == "android:id/ok" }?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                SystemClock.sleep(150)
                continue
            }
            val node = find(root) { it.text?.toString() == text || it.contentDescription?.toString() == text }
            if (node != null) return node
            SystemClock.sleep(150)
        }
        try {
            capture("failure")
            val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "verification")
            val tree = StringBuilder()
            fun describe(node: AccessibilityNodeInfo?, depth: Int) {
                if (node == null || depth > 15 || tree.length > 100000) return
                tree.append(" ".repeat(depth)).append(node.toString()).append('\n')
                for (index in 0 until node.childCount) describe(node.getChild(index), depth + 1)
            }
            describe(instrumentation.uiAutomation.rootInActiveWindow, 0)
            File(directory, "accessibility-failure.txt").writeText(tree.toString())
        } catch (_: Exception) { }
        throw AssertionError("Native screen did not show: $text")
    }

    private fun tab(text: String) {
        var node: AccessibilityNodeInfo? = waitFor(text)
        repeat(8) {
            if (node?.isClickable == true) { assertTrue(node!!.performAction(AccessibilityNodeInfo.ACTION_CLICK)); return }
            node = node?.parent
        }
        throw AssertionError("Tab is not accessible: $text")
    }

    private fun capture(name: String) {
        val image = instrumentation.uiAutomation.takeScreenshot() ?: throw AssertionError("Screenshot unavailable")
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "verification").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        image.recycle()
    }

    @Test fun nativeViewsAndSharedCoreStartWithoutMetro() {
        assertTrue("Images must initialize before the first native view", com.facebook.drawee.backends.pipeline.Fresco.hasBeenInitialized())
        val context = instrumentation.targetContext
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: throw AssertionError("Launcher activity missing")
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        waitFor("Fonyx Launcher")
        val bounds = Rect(); val deadline=SystemClock.uptimeMillis()+10000
        while(SystemClock.uptimeMillis()<deadline) {
            instrumentation.runOnMainSync {
                ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
                    .firstOrNull { it is MainActivity }?.window?.decorView?.getGlobalVisibleRect(bounds)
            }
            if(bounds.width()>bounds.height()) break
            SystemClock.sleep(150)
        }
        assertTrue("Launcher must be landscape", bounds.width() > bounds.height())
        waitFor("Jugar"); SystemClock.sleep(700); capture("home")
        assertNull("Android must not show PC window controls",find(instrumentation.uiAutomation.rootInActiveWindow) { it.contentDescription?.toString() in setOf("Minimizar","Maximizar","Cerrar") })
        tab("Ajustes"); waitFor("El launcher mientras juegas."); capture("settings")
        tab("Cerrar ajustes"); tab("Chat de voz"); waitFor("Desconectado"); capture("voice")
    }
}
