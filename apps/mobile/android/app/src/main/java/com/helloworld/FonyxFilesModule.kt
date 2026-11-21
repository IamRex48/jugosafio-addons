package studios.fonyx.launcher

import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import java.io.File
import java.net.URL
import java.util.concurrent.Executors

class FonyxFilesModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val executor = Executors.newSingleThreadExecutor()
    override fun getName() = "FonyxFiles"

    @ReactMethod fun downloadPack(address: String, sha256: String, promise: Promise) {
        executor.execute {
            try {
                val directory = File(reactApplicationContext.filesDir, "packs")
                promise.resolve(PackDownload.download(URL(address), sha256, directory))
            } catch (error: Exception) { promise.reject("PACK_DOWNLOAD", error.message, error) }
        }
    }

    @ReactMethod fun importPack(name: String, promise: Promise) {
        try {
            require(Regex("[a-f0-9]{64}\\.(mcpack|mcaddon)").matches(name)) { "Archivo inválido." }
            val file = File(File(reactApplicationContext.filesDir, "packs"), name)
            require(file.isFile) { "Primero descarga el pack." }
            val uri = FileProvider.getUriForFile(reactApplicationContext, "${reactApplicationContext.packageName}.packs", file)
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/octet-stream")
                .setPackage("com.mojang.minecraftpe").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            // Import dispatch is not proof of installation: Minecraft exposes no documented result API.
            promise.resolve("sent-to-minecraft")
        } catch (error: Exception) { promise.reject("PACK_IMPORT", "No se pudo abrir el pack con Minecraft: ${error.message}", error) }
    }

    override fun invalidate() { executor.shutdownNow(); super.invalidate() }
}

class FonyxFilesPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext) = listOf<NativeModule>(FonyxFilesModule(context), FonyxCryptoModule(context), FonyxPlatformModule(context), FonyxAccountModule(context))
    override fun createViewManagers(context: ReactApplicationContext) = emptyList<com.facebook.react.uimanager.ViewManager<*, *>>()
}
