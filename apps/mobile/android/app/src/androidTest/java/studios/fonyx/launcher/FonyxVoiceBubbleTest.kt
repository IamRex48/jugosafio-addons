package studios.fonyx.launcher

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.Collections

@RunWith(AndroidJUnit4::class)
class FonyxVoiceBubbleTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun find(node: AccessibilityNodeInfo?, text: String): AccessibilityNodeInfo? {
        if(node == null) return null
        if(node.text?.toString() == text || node.contentDescription?.toString() == text) return node
        for(i in 0 until node.childCount) find(node.getChild(i),text)?.let { return it }
        return null
    }
    private fun node(text: String): AccessibilityNodeInfo {
        val end = SystemClock.uptimeMillis()+10000
        while(SystemClock.uptimeMillis()<end) {
            for(window in instrumentation.uiAutomation.windows) find(window.root,text)?.let { return it }
            SystemClock.sleep(100)
        }
        throw AssertionError("Bubble control missing: $text")
    }
    @Test fun realOverlaySupportsMuteDeafenVolumeAndPttReleaseWithoutRecording() {
        val context=instrumentation.targetContext
        val automation=instrumentation.uiAutomation
        automation.serviceInfo=automation.serviceInfo.apply { flags=flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS }
        automation.executeShellCommand("appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow").use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
        context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val calls=Collections.synchronizedList(mutableListOf<Pair<String,Boolean>>())
        var volume = -1.0
        var bubble:FonyxVoiceBubble? = null
        try {
            instrumentation.runOnMainSync { bubble=FonyxVoiceBubble(context,{name,value->calls.add(name to value)},{volume=it}); bubble!!.show() }
            assertTrue(node("VC").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            assertTrue(node("Silenciar micrófono").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            assertTrue(node("Dejar de escuchar").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            val slider=node("Volumen de voz")
            assertTrue(slider.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id, Bundle().apply { putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,35f) }))
            val bounds=Rect();node("Pulsar para hablar").getBoundsInScreen(bounds)
            val down=SystemClock.uptimeMillis()
            fun touch(action:Int) { val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,bounds.exactCenterX(),bounds.exactCenterY(),0); event.source=InputDevice.SOURCE_TOUCHSCREEN; assertTrue(automation.injectInputEvent(event,true));event.recycle() }
            touch(MotionEvent.ACTION_DOWN);SystemClock.sleep(150);touch(MotionEvent.ACTION_UP)
            instrumentation.waitForIdleSync()
            assertTrue(calls.contains("mute" to true));assertTrue(calls.contains("deafen" to true))
            assertTrue(calls.contains("ptt" to true));assertTrue(calls.contains("ptt" to false));assertEquals(.35,volume,.001)
            val directory=File(context.getExternalFilesDir(null),"verification").apply { mkdirs() }
            automation.takeScreenshot()!!.let { image->File(directory,"voice-bubble.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) };image.recycle() }
            assertTrue(node("Desconectar").performAction(AccessibilityNodeInfo.ACTION_CLICK));instrumentation.waitForIdleSync()
            assertTrue(calls.contains("disconnect" to false))
        } finally {
            instrumentation.runOnMainSync { bubble?.close() }
            automation.executeShellCommand("appops set ${context.packageName} SYSTEM_ALERT_WINDOW default").close()
        }
    }
}
