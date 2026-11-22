package studios.fonyx.launcher

import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import studios.fonyx.auth.accountengine.Accountengine
import studios.fonyx.auth.accountengine.Listener

@RunWith(AndroidJUnit4::class)
class FonyxAccountVaultTest {
    @Test fun keystoreEncryptsSessionRejectsTamperingAndLoadsOurOwnJniWithoutAnAccount() {
        assumeTrue(Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("sdk_gphone"))
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("No se pudo completar la conexión con Xbox Live.",accountFailureMessage("No se pudo completar la conexión con Xbox Live."))
        assertEquals("No se pudo completar la identidad de Microsoft.",accountFailureMessage("private token or provider body"))
        val preferences=context.getSharedPreferences("microsoft-session",0)
        assertNull("This test requires a fresh emulator without a real account",preferences.getString("encrypted",null))
        val vault=AccountVault(context)
        val fixture="private test session, no real credentials"
        try {
            vault.save(fixture)
            val stored=preferences.getString("encrypted",null)!!
            assertFalse(stored.contains(fixture));assertEquals(fixture,AccountVault(context).load())
            val envelope=JSONObject(stored)
            val data=android.util.Base64.decode(envelope.getString("data"),android.util.Base64.NO_WRAP)
            data[0]=(data[0].toInt() xor 1).toByte()
            envelope.put("data",android.util.Base64.encodeToString(data,android.util.Base64.NO_WRAP))
            assertTrue(preferences.edit().putString("encrypted",envelope.toString()).commit())
            assertTrue("Modified encrypted sessions must fail authentication",runCatching { vault.load() }.isFailure)
            vault.clear();assertEquals("",vault.load())
            val engine=Accountengine.new_(vault,object:Listener { override fun authCode(code:String) { throw AssertionError("This offline test must not request login") } })
            assertFalse(engine.savedSignIn());engine.cancel()
        } finally { vault.clear() }
    }
}
