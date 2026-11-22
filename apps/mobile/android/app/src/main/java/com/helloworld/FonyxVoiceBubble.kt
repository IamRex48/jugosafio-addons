package studios.fonyx.launcher

import android.content.Context
import android.content.ComponentCallbacks
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.hardware.display.DisplayManager
import android.os.Build
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.provider.Settings
import android.view.*
import android.widget.*

class FonyxVoiceBubble(private val context: Context, private val action: (String, Boolean) -> Unit, private val volumeChanged: (Double) -> Unit) {
    private val uiContext = if(Build.VERSION.SDK_INT>=30) context.createDisplayContext((context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY)).createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,null) else context
    private val windows = uiContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val resources get() = uiContext.resources
    private var callbacksRegistered=false
    private val configurationCallbacks=object:ComponentCallbacks {
        override fun onConfigurationChanged(config:Configuration) { overlay?.post {
            overlay?.requestLayout()
            val button=pttButton;val params=pttPosition
            if(button!=null&&params!=null) {
                place(button,params,(preferences.all["pttX"] as? Int)?: (resources.displayMetrics.widthPixels-dp(88)),(preferences.all["pttY"] as? Int)?: (resources.displayMetrics.heightPixels/2-dp(32)))
                button.requestLayout()
            }
        } }
        override fun onLowMemory() {}
    }
    private val preferences = context.getSharedPreferences("voice-overlay",0)
    private var overlay: LinearLayout? = null
    private var pttButton: ImageButton? = null
    private var pttPosition: WindowManager.LayoutParams? = null
    private var muteButton: ImageButton? = null
    private var deafenButton: ImageButton? = null
    private var modeButton: ImageButton? = null
    private var lockButton: ImageButton? = null
    private var copyButton: ImageButton? = null
    private var muted=false;private var deafened=false;private var verified=false;private var speaking=false
    private var pttMode=false;private var held=false
    private var pttLocked=(preferences.all["pttLocked"] as? Boolean)?:true
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    private fun shape(border:Int,round:Boolean=false)=GradientDrawable().apply { setColor(Color.rgb(28,28,28));cornerRadius=dp(if(round)32 else 10).toFloat();setStroke(dp(2),border) }
    private fun position(width:Int,height:Int)=WindowManager.LayoutParams(width,height,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_SPLIT_TOUCH,PixelFormat.TRANSLUCENT).apply { gravity=Gravity.TOP or Gravity.LEFT }
    private fun place(view:View,params:WindowManager.LayoutParams,x:Int=params.x,y:Int=params.y) {
        val nextX=x.coerceIn(0,(resources.displayMetrics.widthPixels-view.width).coerceAtLeast(0));val nextY=y.coerceIn(0,(resources.displayMetrics.heightPixels-view.height).coerceAtLeast(0))
        if(params.x!=nextX||params.y!=nextY) { params.x=nextX;params.y=nextY;windows.updateViewLayout(view,params) }
    }
    private fun icon(label:String,image:Int)=ImageButton(uiContext).apply { contentDescription=label;tooltipText=label;setImageResource(image);imageTintList=ColorStateList.valueOf(Color.WHITE);scaleType=ImageView.ScaleType.FIT_CENTER;setPadding(dp(12),dp(12),dp(12),dp(12));background=shape(Color.BLACK) }
    private fun releaseTalk() { if(held) { held=false;action("ptt",false) };pttButton?.isPressed=false }
    private fun savePosition() { pttPosition?.let { preferences.edit().putInt("pttX",it.x).putInt("pttY",it.y).apply() } }
    private fun hidePtt() { releaseTalk();pttButton?.let { try { windows.removeView(it) } catch(_:Exception) {} };pttButton=null;pttPosition=null }
    private fun setMode(value:Boolean,notify:Boolean=false) {
        if(pttMode!=value) { releaseTalk();pttMode=value }
        if(value) showPtt() else if(pttButton!=null) hidePtt()
        refreshIcons()
        if(notify) action("ptt-mode",value)
    }
    private fun setLocked(value:Boolean) {
        releaseTalk();pttLocked=value;savePosition();preferences.edit().putBoolean("pttLocked",value).apply();refreshIcons()
    }
    private fun refreshIcons() {
        for((button,selected) in listOf(muteButton to muted,deafenButton to deafened,modeButton to pttMode)) button?.let { it.isSelected=selected;it.background=shape(if(selected)Color.WHITE else Color.BLACK) }
        modeButton?.contentDescription=if(pttMode)"Usar micrófono abierto" else "Activar pulsar para hablar"
        modeButton?.tooltipText=modeButton?.contentDescription
        lockButton?.apply { isEnabled=pttMode;alpha=if(pttMode)1f else .35f;setImageResource(if(pttLocked)R.drawable.voice_lock else R.drawable.voice_move);contentDescription=if(pttLocked)"Desbloquear botón para moverlo" else "Fijar botón para hablar";tooltipText=contentDescription }
        copyButton?.apply { isEnabled=!verified;alpha=if(verified).35f else 1f }
        pttButton?.apply { setImageResource(if(pttLocked)R.drawable.voice_mic else R.drawable.voice_move);contentDescription=if(pttLocked)"Pulsar para hablar" else "Mover botón para hablar";background=shape(if(speaking&&verified&&!muted&&!deafened&&pttLocked)Color.WHITE else Color.BLACK,true) }
    }
    private fun showPtt() {
        if(pttButton!=null)return
        if(!Settings.canDrawOverlays(context)) { action("overlay-error",false);return }
        val button=icon(if(pttLocked)"Pulsar para hablar" else "Mover botón para hablar",R.drawable.voice_mic)
        val params=position(dp(64),dp(64)).apply { x=(preferences.all["pttX"] as? Int)?: (resources.displayMetrics.widthPixels-dp(88)).coerceAtLeast(0);y=(preferences.all["pttY"] as? Int)?: (resources.displayMetrics.heightPixels/2-dp(32)).coerceAtLeast(0) }
        var pointer=-1;var initialX=0;var initialY=0;var downX=0f;var downY=0f
        button.setOnTouchListener { _,event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { pointer=event.getPointerId(0);initialX=params.x;initialY=params.y;downX=event.rawX;downY=event.rawY;if(pttLocked) { held=true;button.isPressed=true;action("ptt",true) } else releaseTalk() }
                MotionEvent.ACTION_MOVE -> if(pointer!=-1) {
                    if(!pttLocked) place(button,params,initialX+(event.rawX-downX).toInt(),initialY+(event.rawY-downY).toInt())
                    else { val index=event.findPointerIndex(pointer);if(index<0||event.getX(index)<0||event.getY(index)<0||event.getX(index)>button.width||event.getY(index)>button.height)releaseTalk() }
                }
                MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL -> { pointer=-1;releaseTalk();if(!pttLocked)savePosition() }
                MotionEvent.ACTION_POINTER_UP -> if(event.getPointerId(event.actionIndex)==pointer) { pointer=-1;releaseTalk();if(!pttLocked)savePosition() }
            };true
        }
        button.addOnLayoutChangeListener { _,_,_,_,_,_,_,_,_ -> if(pttButton===button)place(button,params) }
        try { windows.addView(button,params);pttButton=button;pttPosition=params;refreshIcons() } catch(_:Exception) { action("overlay-error",false) }
    }
    fun show() {
        if(overlay!=null)return
        if(!Settings.canDrawOverlays(context)) { action("overlay-error",false);return }
        val root=LinearLayout(uiContext).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(4),dp(4),dp(4),dp(4));background=shape(Color.BLACK) }
        val handle=icon("Burbuja de voz",R.drawable.voice_brand).apply { layoutParams=LinearLayout.LayoutParams(dp(56),dp(48)) }
        val controls=LinearLayout(uiContext).apply { orientation=LinearLayout.VERTICAL }
        val grid=GridLayout(uiContext).apply { columnCount=4 }
        val scroll=ScrollView(uiContext).apply { visibility=View.GONE;layoutParams=LinearLayout.LayoutParams(dp(220),minOf(dp(156),(resources.displayMetrics.heightPixels-dp(64)).coerceAtLeast(dp(48))));addView(controls,FrameLayout.LayoutParams(-1,-2)) }
        fun button(label:String,image:Int,click:()->Unit)=icon(label,image).apply { setOnClickListener { click() };grid.addView(this,GridLayout.LayoutParams().apply { width=dp(48);height=dp(48);setMargins(dp(3),dp(3),dp(3),dp(3)) }) }
        muteButton=button("Silenciar micrófono",R.drawable.voice_mic) { action("mute",!muted) }
        deafenButton=button("Dejar de escuchar",R.drawable.voice_speaker) { action("deafen",!deafened) }
        modeButton=button("Activar pulsar para hablar",R.drawable.voice_ptt) { setMode(!pttMode,true) }
        lockButton=button("Desbloquear botón para moverlo",R.drawable.voice_lock) { setLocked(!pttLocked) }
        copyButton=button("Copiar comando",R.drawable.voice_copy) { action("copy-code",false) }
        button("Abrir Fonyx",R.drawable.voice_home) { context.startActivity(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
        button("Desconectar",R.drawable.voice_close) { action("disconnect",false) }
        controls.addView(grid)
        controls.addView(SeekBar(uiContext).apply { max=100;progress=100;contentDescription="Volumen de voz";progressTintList=ColorStateList.valueOf(Color.WHITE);thumbTintList=ColorStateList.valueOf(Color.WHITE);progressBackgroundTintList=ColorStateList.valueOf(Color.GRAY);setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar:SeekBar?,value:Int,fromUser:Boolean) { if(fromUser)volumeChanged(value/100.0) }
            override fun onStartTrackingTouch(bar:SeekBar?) {}
            override fun onStopTrackingTouch(bar:SeekBar?) {}
        }) },LinearLayout.LayoutParams(-1,dp(48)))
        root.addView(handle);root.addView(scroll)
        val params=position(dp(64),-2).apply { x=0;y=200 }
        handle.setOnClickListener { scroll.visibility=if(scroll.visibility==View.VISIBLE)View.GONE else View.VISIBLE;params.width=dp(if(scroll.visibility==View.VISIBLE)228 else 64);windows.updateViewLayout(root,params) }
        root.addOnLayoutChangeListener { _,_,_,_,_,_,_,_,_ -> if(overlay===root)place(root,params) }
        var initialX=0;var initialY=0;var downX=0f;var downY=0f;var moved=false
        val slop=ViewConfiguration.get(uiContext).scaledTouchSlop
        handle.setOnTouchListener { _,event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { initialX=params.x;initialY=params.y;downX=event.rawX;downY=event.rawY;moved=false }
                MotionEvent.ACTION_MOVE -> { val dx=event.rawX-downX;val dy=event.rawY-downY;if(kotlin.math.abs(dx)+kotlin.math.abs(dy)>slop)moved=true;if(moved)place(root,params,initialX+dx.toInt(),initialY+dy.toInt()) }
                MotionEvent.ACTION_UP -> if(!moved)handle.performClick()
            };true
        }
        try { windows.addView(root,params);overlay=root;if(!callbacksRegistered) { uiContext.registerComponentCallbacks(configurationCallbacks);callbacksRegistered=true };refreshIcons() } catch(_:Exception) { action("overlay-error",false) }
    }
    fun update(mute:Boolean,deafen:Boolean,accepted:Boolean,talking:Boolean,pushToTalk:Boolean) { muted=mute;deafened=deafen;verified=accepted;speaking=talking;setMode(pushToTalk);overlay?.background=shape(if(accepted&&talking&&!mute&&!deafen)Color.WHITE else Color.BLACK);show() }
    fun close() { hidePtt();overlay?.let { try { windows.removeView(it) } catch(_:Exception) {} };if(callbacksRegistered) { uiContext.unregisterComponentCallbacks(configurationCallbacks);callbacksRegistered=false };overlay=null;muteButton=null;deafenButton=null;modeButton=null;lockButton=null;copyButton=null }
}
