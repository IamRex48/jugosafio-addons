package studios.fonyx.launcher

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Promise
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FonyxAccountBackgroundTest {
    @Test fun accountOperationStaysForegroundWhenAnotherAppOwnsFocusAndCleansUp() {
        assumeTrue(Build.FINGERPRINT.contains("generic")||Build.MODEL.contains("sdk_gphone"))
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.targetContext
        if(Build.VERSION.SDK_INT>=33)instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.POST_NOTIFICATIONS").use {android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()}
        val launch=context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
        val app=context.applicationContext as MainApplication
        val deadline=SystemClock.uptimeMillis()+20000
        var module:FonyxAccountModule?=null
        while(SystemClock.uptimeMillis()<deadline&&module==null) {
            module=app.reactHost.currentReactContext?.getNativeModule(FonyxAccountModule::class.java)
            SystemClock.sleep(100)
        }
        assertNotNull(module);SystemClock.sleep(500)
        fun call(start:Boolean) {
            val ready=CountDownLatch(1);var result=""
            val promise=Proxy.newProxyInstance(Promise::class.java.classLoader,arrayOf(Promise::class.java)){_,method,_->if(method.name in listOf("resolve","reject")){result=method.name;ready.countDown()};null} as Promise
            if(start)module!!.begin(promise)else module!!.end(promise)
            assertTrue(ready.await(10,TimeUnit.SECONDS));assertEquals("resolve",result)
        }
        try {
            call(true)
            context.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            SystemClock.sleep(800)
            assertNotNull("Authentication must survive losing app focus",FonyxAccountService.instance)
            val info=ActivityManager.RunningAppProcessInfo();ActivityManager.getMyMemoryState(info)
            assertTrue("Account service must retain foreground process priority",info.importance<=ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE)
            assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.any {it.id==42})
        } finally {
            call(false)
            assertNull(FonyxAccountService.instance)
            val cleanupDeadline=SystemClock.uptimeMillis()+3000
            while(SystemClock.uptimeMillis()<cleanupDeadline&&context.getSystemService(NotificationManager::class.java).activeNotifications.any {it.id==42})SystemClock.sleep(50)
            assertFalse(context.getSystemService(NotificationManager::class.java).activeNotifications.any {it.id==42})
            context.startActivity(launch)
        }
    }
}
