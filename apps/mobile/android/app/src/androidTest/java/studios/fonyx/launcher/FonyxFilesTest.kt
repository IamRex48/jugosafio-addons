package studios.fonyx.launcher

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BridgeReactContext
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.reflect.Proxy
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FonyxFilesTest {
    private fun call(action: (FonyxFilesModule, Promise) -> Unit): Pair<String, Array<out Any?>?> {
        val ready = CountDownLatch(1)
        var result: Pair<String, Array<out Any?>?>? = null
        val promise = Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, args ->
            if (method.name == "resolve" || method.name == "reject") { result = Pair(method.name, args); ready.countDown() }
            null
        } as Promise
        val context = BridgeReactContext(InstrumentationRegistry.getInstrumentation().targetContext)
        val module = FonyxFilesModule(context)
        try { action(module, promise); assertTrue("Promise timed out", ready.await(20, TimeUnit.SECONDS)); return result!! }
        finally { module.invalidate() }
    }

    @Test fun refusesInsecureAndCredentialDownloads() {
        for (url in listOf("http://example.org/p.mcpack", "https://user:password@example.org/p.mcpack")) {
            val result = call { module, promise -> module.downloadPack(url, "0".repeat(64), promise) }
            assertEquals("reject", result.first); assertEquals("PACK_DOWNLOAD", result.second!![0])
        }
    }

    @Test fun rejectsBadHashesAndImportTraversal() {
        assertEquals("reject", call { m, p -> m.downloadPack("https://example.org/p.mcpack", "invalid", p) }.first)
        for (name in listOf("../other.mcpack", "missing.mcpack", "0".repeat(64)+".mcpack")) {
            val result = call { m, p -> m.importPack(name, p) }
            assertEquals("reject", result.first); assertEquals("PACK_IMPORT", result.second!![0])
        }
    }

    @Test fun reusesOnlyAnAlreadyVerifiedCachedFile() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val data = "Fonyx hash verification fixture".toByteArray()
        val hash = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
        val directory = java.io.File(context.filesDir, "packs").apply { mkdirs() }
        val file = java.io.File(directory, "$hash.mcpack").apply { writeBytes(data) }
        try {
            val result = call { m, p -> m.downloadPack("https://not-contacted.invalid/fixture.mcpack", hash, p) }
            assertEquals("resolve", result.first); assertEquals(file.name, result.second!![0])
            assertArrayEquals(data, file.readBytes())
        } finally { file.delete() }
    }
}
