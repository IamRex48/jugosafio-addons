package studios.fonyx.launcher

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.provider.Settings
import android.view.*
import android.widget.*

class FonyxVoiceBubble(private val context: Context, private val action: (String, Boolean) -> Unit, private val volumeChanged: (Double) -> Unit) {
    private val windows = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val resources get() = context.resources
    private var overlay: LinearLayout? = null
    private var badge: TextView? = null
    private var muted = false; private var deafened = false; private var verified = false
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun shape(border: Int) = GradientDrawable().apply { setColor(Color.rgb(18, 24, 32)); cornerRadius = dp(10).toFloat(); setStroke(dp(2), border) }
    fun show() {
        if (overlay != null || !Settings.canDrawOverlays(context)) return
        val root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(4), dp(4), dp(4), dp(4)); background = shape(Color.BLACK) }
        val handle = TextView(context).apply { text = "VC"; textSize = 16f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; contentDescription = "Chat de voz"; layoutParams = LinearLayout.LayoutParams(dp(56), dp(48)) }
        val controls = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(context).apply { visibility = View.GONE; layoutParams = LinearLayout.LayoutParams(dp(220),minOf(dp(336),(resources.displayMetrics.heightPixels-dp(64)).coerceAtLeast(dp(48)))); addView(controls,FrameLayout.LayoutParams(-1,-2)) }
        fun button(label: String, click: () -> Unit): Button = Button(context).apply { text = label; isAllCaps = false; textSize = 12f; setTextColor(Color.WHITE); backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(42,42,42)); setOnClickListener { click() }; controls.addView(this,LinearLayout.LayoutParams(-1,dp(48))) }
        button("Silenciar micrófono") { action("mute", !muted) }
        button("Dejar de escuchar") { action("deafen", !deafened) }
        button("Pulsar para hablar") {}.apply { setOnTouchListener { _, event -> when(event.actionMasked) { MotionEvent.ACTION_DOWN -> action("ptt", true); MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> action("ptt", false) }; true } }
        button("Copiar comando") { action("copy-code", false) }
        controls.addView(SeekBar(context).apply { max = 100; progress = 100; contentDescription = "Volumen de voz"; setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar?, value: Int, fromUser: Boolean) { if(fromUser) volumeChanged(value / 100.0) }
            override fun onStartTrackingTouch(bar: SeekBar?) {}
            override fun onStopTrackingTouch(bar: SeekBar?) {}
        }) },LinearLayout.LayoutParams(-1,dp(48)))
        button("Abrir Fonyx") { context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
        button("Desconectar") { action("disconnect", false) }
        root.addView(handle); root.addView(scroll)
        val position = WindowManager.LayoutParams(dp(64), -2, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.LEFT; x = 0; y = 200 }
        handle.setOnClickListener { scroll.visibility = if(scroll.visibility == View.VISIBLE) View.GONE else View.VISIBLE; position.width = dp(if(scroll.visibility == View.VISIBLE) 228 else 64); windows.updateViewLayout(root,position) }
        root.addOnLayoutChangeListener { _,_,_,_,_,_,_,_,_ ->
            val x=position.x.coerceIn(0,(resources.displayMetrics.widthPixels-root.width).coerceAtLeast(0));val y=position.y.coerceIn(0,(resources.displayMetrics.heightPixels-root.height).coerceAtLeast(0))
            if(overlay === root && (x!=position.x||y!=position.y)) { position.x=x;position.y=y;windows.updateViewLayout(root,position) }
        }
        var initialX = 0; var initialY = 0; var downX = 0f; var downY = 0f; var moved = false
        handle.setOnTouchListener { _, event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { initialX = position.x; initialY = position.y; downX = event.rawX; downY = event.rawY; moved = false }
                MotionEvent.ACTION_MOVE -> { val dx = event.rawX - downX; val dy = event.rawY - downY; if (kotlin.math.abs(dx) + kotlin.math.abs(dy) > 12) moved = true; position.x = (initialX + dx.toInt()).coerceIn(0, (resources.displayMetrics.widthPixels-root.width).coerceAtLeast(0)); position.y = (initialY+dy.toInt()).coerceIn(0,(resources.displayMetrics.heightPixels-root.height).coerceAtLeast(0)); windows.updateViewLayout(root, position) }
                MotionEvent.ACTION_UP -> if (!moved) handle.performClick()
            }; true
        }
        try { windows.addView(root, position); overlay = root; badge = handle } catch (_: Exception) { action("overlay-error", false) }
    }
    fun update(mute: Boolean, deafen: Boolean, accepted: Boolean, speaking: Boolean) { muted = mute; deafened = deafen; verified = accepted; badge?.text = if(mute) "M" else if(deafen) "S" else "VC"; overlay?.background = shape(if(accepted&&speaking&&!mute&&!deafen) Color.WHITE else Color.BLACK); show() }
    fun close() { action("ptt", false); overlay?.let { try { windows.removeView(it) } catch (_: Exception) {} }; overlay = null; badge = null }
}
