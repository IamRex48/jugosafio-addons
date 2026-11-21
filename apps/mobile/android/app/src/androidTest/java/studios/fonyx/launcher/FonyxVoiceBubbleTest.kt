package studios.fonyx.launcher

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import org.junit.Assume.assumeTrue
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
        if(node.text?.toString() == text || node.contentDescription?.toString() == text || node.viewIdResourceName == text) return node
        for(i in 0 until node.childCount) find(node.getChild(i),text)?.let { return it }
        return null
    }
    private fun node(text: String): AccessibilityNodeInfo {
        val end = SystemClock.uptimeMillis()+10000
        while(SystemClock.uptimeMillis()<end) {
            val active=instrumentation.uiAutomation.rootInActiveWindow
            if(active?.packageName == "android" && find(active,"android:id/immersive_cling_title") != null) { find(active,"android:id/ok")?.performAction(AccessibilityNodeInfo.ACTION_CLICK); SystemClock.sleep(150); continue }
            for(window in instrumentation.uiAutomation.windows) find(window.root,text)?.let { return it }
            SystemClock.sleep(100)
        }
        throw AssertionError("Bubble control missing: $text")
    }
    @Test fun iconMenuAndIndependentPttSupportLockMoveHoldAndReleaseWithoutRecording() {
        assumeTrue(Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("sdk_gphone"))
        val context=instrumentation.targetContext;val automation=instrumentation.uiAutomation
        val preferences=context.getSharedPreferences("voice-overlay",0)
        assertTrue("Overlay test requires a fresh emulator",preferences.all.isEmpty())
        automation.serviceInfo=automation.serviceInfo.apply { flags=flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS }
        automation.executeShellCommand("appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow").use { android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
        context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        node("Fonyx Launcher");SystemClock.sleep(500)
        val calls=Collections.synchronizedList(mutableListOf<Pair<String,Boolean>>());var volume=-1.0
        var bubble:FonyxVoiceBubble?=null
        fun bounds(label:String)=Rect().also { node(label).getBoundsInScreen(it) }
        fun touch(down:Long,action:Int,x:Float,y:Float) { val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);event.source=InputDevice.SOURCE_TOUCHSCREEN;assertTrue(automation.injectInputEvent(event,true));event.recycle() }
        fun gesture(rect:Rect,dx:Float=0f,dy:Float=0f,cancel:Boolean=false) {
            val down=SystemClock.uptimeMillis();touch(down,MotionEvent.ACTION_DOWN,rect.exactCenterX(),rect.exactCenterY())
            if(dx!=0f||dy!=0f)touch(down,MotionEvent.ACTION_MOVE,rect.exactCenterX()+dx,rect.exactCenterY()+dy)
            SystemClock.sleep(100);touch(down,if(cancel)MotionEvent.ACTION_CANCEL else MotionEvent.ACTION_UP,rect.exactCenterX()+dx,rect.exactCenterY()+dy)
            instrumentation.waitForIdleSync();SystemClock.sleep(150)
        }
        try {
            instrumentation.runOnMainSync { bubble=FonyxVoiceBubble(context,{name,value->calls.add(name to value)},{volume=it});bubble!!.show() }
            assertTrue(node("Burbuja de voz").performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(300)
            for(label in listOf("Silenciar micrófono","Dejar de escuchar","Activar pulsar para hablar","Copiar comando","Abrir Fonyx","Desconectar")) {
                assertEquals("Controls must be icons", "android.widget.ImageButton",node(label).className.toString())
                assertTrue(bounds(label).width()>=47*context.resources.displayMetrics.density)
            }
            assertTrue(node("Silenciar micrófono").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            assertTrue(node("Dejar de escuchar").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            assertTrue(node("Volumen de voz").performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id,Bundle().apply { putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,35f) }))
            assertTrue(node("Activar pulsar para hablar").performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(200)
            assertTrue(calls.contains("ptt-mode" to true))
            val locked=bounds("Pulsar para hablar")
            gesture(locked,8*context.resources.displayMetrics.density)
            assertEquals("Locked PTT must stay in place",locked,bounds("Pulsar para hablar"))
            assertTrue(calls.contains("ptt" to true));assertTrue(calls.contains("ptt" to false))
            assertTrue(node("Desbloquear botón para moverlo").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            val talkingBefore=calls.count { it==("ptt" to true) }
            gesture(bounds("Mover botón para hablar"),-64*context.resources.displayMetrics.density,-32*context.resources.displayMetrics.density)
            val moved=bounds("Mover botón para hablar")
            assertNotEquals("Unlocked PTT must move",locked,moved)
            assertEquals("Moving must never transmit",talkingBefore,calls.count { it==("ptt" to true) })
            assertTrue(preferences.contains("pttX"));assertTrue(preferences.contains("pttY"))
            assertTrue(node("Fijar botón para hablar").performAction(AccessibilityNodeInfo.ACTION_CLICK))
            assertTrue(preferences.getBoolean("pttLocked",false))
            gesture(bounds("Pulsar para hablar"),cancel=true)
            assertEquals("ptt" to false,calls.last())
            assertTrue(node("Usar micrófono abierto").performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(100)
            assertTrue(calls.contains("ptt-mode" to false))
            assertTrue(node("Activar pulsar para hablar").performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(150)
            assertEquals("PTT placement must survive toggling the mode",moved,bounds("Pulsar para hablar"))
            val directory=File(context.getExternalFilesDir(null),"verification").apply { mkdirs() }
            automation.takeScreenshot()!!.let { image->File(directory,"voice-bubble.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) };image.recycle() }
            context.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            SystemClock.sleep(1000)
            val outside=automation.takeScreenshot()!!
            File(directory,"voice-over-home.png").outputStream().use { outside.compress(Bitmap.CompressFormat.PNG,100,it) }
            for(label in listOf("Burbuja de voz","Pulsar para hablar")) {
                val rect=bounds(label)
                assertTrue("Overlay must remain visible outside Fonyx: $label $rect",node(label).isVisibleToUser && rect.left>=0 && rect.top>=0 && rect.right<=outside.width && rect.bottom<=outside.height)
            }
            outside.recycle()
            gesture(bounds("Pulsar para hablar"),cancel=true)
            assertTrue(calls.contains("mute" to true));assertTrue(calls.contains("deafen" to true));assertEquals(.35,volume,.001)
            assertTrue(node("Desconectar").performAction(AccessibilityNodeInfo.ACTION_CLICK));instrumentation.waitForIdleSync();assertTrue(calls.contains("disconnect" to false))
        } finally {
            instrumentation.runOnMainSync { bubble?.close() }
            preferences.edit().clear().commit()
            automation.executeShellCommand("appops set ${context.packageName} SYSTEM_ALERT_WINDOW default").close()
            context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
