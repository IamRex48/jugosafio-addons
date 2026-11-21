package studios.fonyx.launcher

import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

class FonyxFilesModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val executor = Executors.newSingleThreadExecutor()
    override fun getName() = "FonyxFiles"

    private fun digest(file: File): String = file.inputStream().use { input ->
        val hash = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(65536)
        while (true) { val n = input.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) }
        hash.digest().joinToString("") { "%02x".format(it) }
    }

    @ReactMethod fun downloadPack(address: String, sha256: String, promise: Promise) {
        executor.execute {
            try {
                require(Regex("[a-fA-F0-9]{64}").matches(sha256)) { "SHA-256 inválido." }
                val original = URL(address)
                require(original.protocol == "https" && original.userInfo == null) { "La descarga necesita HTTPS sin credenciales." }
                val suffix = if (original.path.endsWith(".mcaddon", true)) ".mcaddon" else ".mcpack"
                val directory = File(reactApplicationContext.filesDir, "packs").apply { mkdirs() }
                val target = File(directory, sha256.lowercase() + suffix)
                if (!target.exists() || digest(target) != sha256.lowercase()) {
                    val partial = File(directory, target.name + ".part")
                    var url = original
                    var connection: HttpURLConnection? = null
                    for (redirect in 0..5) {
                        require(url.protocol == "https" && url.userInfo == null) { "La descarga necesita HTTPS sin credenciales." }
                        val request = (url.openConnection() as HttpURLConnection).apply {
                            instanceFollowRedirects = false; connectTimeout = 20000; readTimeout = 30000
                        }
                        val status = request.responseCode
                        if (status in listOf(301, 302, 303, 307, 308)) {
                            val location = request.getHeaderField("Location") ?: error("Redirección inválida.")
                            request.disconnect(); url = URL(url, location)
                        } else { connection = request; break }
                    }
                    val request = connection ?: error("Demasiadas redirecciones.")
                    try {
                        require(request.responseCode == 200) { "Descarga fallida: HTTP ${request.responseCode}." }
                        require(request.contentLengthLong <= 1024L * 1024 * 1024) { "El pack supera 1 GiB." }
                        require(request.contentLengthLong < 0 || directory.usableSpace > request.contentLengthLong + 128L * 1024 * 1024) { "No hay espacio suficiente para descargar el pack." }
                        var bytes = 0L
                        request.inputStream.use { input -> partial.outputStream().use { output ->
                            val buffer = ByteArray(65536)
                            while (true) {
                                val n = input.read(buffer); if (n < 0) break
                                bytes += n; require(bytes <= 1024L * 1024 * 1024) { "El pack supera 1 GiB." }
                                output.write(buffer, 0, n)
                            }
                        } }
                        require(digest(partial) == sha256.lowercase()) { "SHA-256 incorrecto. No se importará el pack." }
                        require(partial.renameTo(target)) { "No se pudo guardar el pack verificado." }
                    } catch (error: Exception) { partial.delete(); throw error }
                    finally { request.disconnect() }
                }
                promise.resolve(target.name)
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
    override fun createNativeModules(context: ReactApplicationContext) = listOf<NativeModule>(FonyxFilesModule(context), FonyxCryptoModule(context))
    override fun createViewManagers(context: ReactApplicationContext) = emptyList<com.facebook.react.uimanager.ViewManager<*, *>>()
}
