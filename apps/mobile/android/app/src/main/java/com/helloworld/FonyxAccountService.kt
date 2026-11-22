package studios.fonyx.launcher

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat

class FonyxAccountService:Service() {
    companion object {
        @Volatile var instance:FonyxAccountService?=null
        var cancelAuthentication:(()->Unit)?=null
    }
    private val handler=Handler(Looper.getMainLooper())
    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("fonyx-account","Cuenta Microsoft",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,42,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification=NotificationCompat.Builder(this,"fonyx-account").setSmallIcon(R.drawable.voice_brand).setContentTitle("Fonyx · Conectando tu cuenta").setContentText("Puedes continuar en Microsoft y volver a Fonyx.").setContentIntent(open).setOngoing(true).setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE).build()
        startForeground(42,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        instance=this
        handler.postDelayed({stopSelf()},15*60*1000L)
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int)=START_NOT_STICKY
    override fun onBind(intent:Intent?)=null
    override fun onTimeout(startId:Int,fgsType:Int) { stopSelf() }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        cancelAuthentication?.invoke()
        instance=null
        super.onDestroy()
    }
}
