package studios.fonyx.launcher

import android.app.Application
import android.content.Context
import android.media.AudioAttributes
import com.oney.WebRTCModule.WebRTCModuleOptions
import org.webrtc.audio.JavaAudioDeviceModule
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.react.modules.fresco.FrescoModule

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(FonyxFilesPackage())
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // Initialize images before Fabric can preallocate the first view (observed startup race on API35).
    Fresco.initialize(this)
    FrescoModule(null, Fresco.getImagePipeline(), true, true)
    WebRTCModuleOptions.getInstance().audioDeviceModule = createVoiceAudioDevice(this)
  }
}

// VCMC 2.3.5 uses GAME/SPEECH for its game output, sharing the normal media route.
fun createVoiceAudioDevice(context:Context):JavaAudioDeviceModule = JavaAudioDeviceModule.builder(context)
    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
    .setEnableVolumeLogger(false).createAudioDeviceModule()
