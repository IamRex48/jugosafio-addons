package studios.fonyx.launcher

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class FonyxScreenTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()

    private fun find(node: AccessibilityNodeInfo?, text: String): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.text?.toString() == text || node.contentDescription?.toString() == text) return node
        for (index in 0 until node.childCount) { val match = find(node.getChild(index), text); if (match != null) return match }
        return null
    }

    private fun waitFor(text: String): AccessibilityNodeInfo {
        val deadline = SystemClock.uptimeMillis() + 25000
        while (SystemClock.uptimeMillis() < deadline) {
            val node = find(instrumentation.uiAutomation.rootInActiveWindow, text)
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
        val context = instrumentation.targetContext
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: throw AssertionError("Launcher activity missing")
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        waitFor("Fonyx Launcher")
        val bounds = Rect(); instrumentation.uiAutomation.rootInActiveWindow.getBoundsInScreen(bounds)
        assertTrue("Launcher must be landscape", bounds.width() > bounds.height())
        waitFor("Jugar"); SystemClock.sleep(700); capture("home")
        tab("Ajustes"); waitFor("El launcher mientras juegas."); capture("settings")
        tab("Cerrar ajustes"); tab("Chat de voz"); waitFor("Desconectado"); capture("voice")
    }
}
