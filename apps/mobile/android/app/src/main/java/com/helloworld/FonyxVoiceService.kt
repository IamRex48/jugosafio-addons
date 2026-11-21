package studios.fonyx.launcher

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class FonyxVoiceService : HeadlessJsTaskService() {
    companion object {
        @Volatile var instance: FonyxVoiceService? = null
        var dispatch: ((String, Boolean) -> Unit)? = null
        var volumeChanged: ((Double) -> Unit)? = null
        var stopMicrophone: (() -> Unit)? = null
        fun action(name: String, value: Boolean = false) { dispatch?.invoke(name, value) }
    }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var audio: AudioManager
    private lateinit var focus: AudioFocusRequest
    private var bubble: FonyxVoiceBubble? = null
    override fun getTaskConfig(intent: Intent?) = HeadlessJsTaskConfig("FonyxVoice", Arguments.createMap(), 0, true)
    override fun onCreate() {
        super.onCreate(); instance = this
        audio = getSystemService(AUDIO_SERVICE) as AudioManager
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("fonyx-voice", "Chat de voz", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getService(this, 2, Intent(this, FonyxVoiceService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, "fonyx-voice").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Fonyx · Chat de voz").setContentText("Esperando verificación de Minecraft").setContentIntent(open).setOngoing(true).addAction(0, "Desconectar", stop).build()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { stopSelf(); return }
        if (Build.VERSION.SDK_INT >= 29) startForeground(41, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(41, notification)
        focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener { action("focus", it != AudioManager.AUDIOFOCUS_GAIN) }.build()
        audio.mode = AudioManager.MODE_IN_COMMUNICATION; audio.requestAudioFocus(focus)
        bubble = FonyxVoiceBubble(this, { name, value -> if(name == "disconnect") { stopMicrophone?.invoke(); action(name); stopSelf() } else action(name, value) }, { volumeChanged?.invoke(it) }).also { it.show() }
    }
    fun update(mute: Boolean, deafen: Boolean, accepted: Boolean, speaking: Boolean) { handler.post { bubble?.update(mute, deafen, accepted, speaking) } }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action == "stop") { stopMicrophone?.invoke(); action("disconnect"); stopSelf(); return START_NOT_STICKY }
        super.onStartCommand(intent, flags, startId); return START_NOT_STICKY
    }
    override fun onDestroy() { stopMicrophone?.invoke(); action("service-stopped"); bubble?.close(); bubble = null; if(::focus.isInitialized) audio.abandonAudioFocusRequest(focus); if(::audio.isInitialized) audio.mode = AudioManager.MODE_NORMAL; instance = null; super.onDestroy() }
}
