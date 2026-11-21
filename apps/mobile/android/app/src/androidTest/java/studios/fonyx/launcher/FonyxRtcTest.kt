package studios.fonyx.launcher

import android.content.Intent
import android.content.Context
import android.media.AudioManager
import android.media.AudioAttributes
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.webrtc.*
import java.io.File
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FonyxRtcTest {
    private class Description : SdpObserver {
        val ready=CountDownLatch(1);var value:SessionDescription?=null;var error:String?=null
        override fun onCreateSuccess(sdp:SessionDescription) { value=sdp;ready.countDown() }
        override fun onSetSuccess() { ready.countDown() }
        override fun onCreateFailure(message:String) { error=message;ready.countDown() }
        override fun onSetFailure(message:String) { error=message;ready.countDown() }
        fun waitFor():SessionDescription? { assertTrue("SDP callback timeout",ready.await(10,TimeUnit.SECONDS));assertNull(error);return value }
    }
    private class Observer : PeerConnection.Observer {
        val candidates=ConcurrentLinkedQueue<IceCandidate>()
        override fun onSignalingChange(state:PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state:PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(value:Boolean) {}
        override fun onIceGatheringChange(state:PeerConnection.IceGatheringState) {}
        override fun onIceCandidate(candidate:IceCandidate) { candidates.add(candidate) }
        override fun onIceCandidatesRemoved(candidates:Array<IceCandidate>) {}
        override fun onAddStream(stream:MediaStream) {}
        override fun onRemoveStream(stream:MediaStream) {}
        override fun onDataChannel(channel:DataChannel) {}
        override fun onRenegotiationNeeded() {}
    }
    private fun received(pc:PeerConnection):Pair<Long,Long> {
        val ready=CountDownLatch(1);var result=0L to 0L
        pc.getStats { report->
            val audio=report.statsMap.values.filter { it.type=="inbound-rtp" && it.members["kind"]=="audio" && report.statsMap[it.members["codecId"]]?.members?.get("mimeType")?.toString()?.equals("audio/opus",true)==true }
            result=audio.sumOf { (it.members["totalSamplesReceived"] as? Number)?.toLong()?:0L } to audio.sumOf { (it.members["bytesReceived"] as? Number)?.toLong()?:0L }
            ready.countDown()
        }
        assertTrue("RTP stats callback timeout",ready.await(3,TimeUnit.SECONDS));return result
    }
    @Test fun nativeOpusConnectionsReceiveDecodedSamplesInBothDirectionsOnEmulator() {
        // Only emulated audio: this test must never open a person's physical microphone.
        assumeTrue(Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("sdk_gphone"))
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.targetContext
        instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.RECORD_AUDIO").use { ParcelFileDescriptor.AutoCloseInputStream(it).readBytes() }
        context.startActivity(context.packageManager.getLaunchIntentForPackage(context.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(1000)
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
        val device=createVoiceAudioDevice(context)
        device.setSpeakerMute(true)
        val factory=PeerConnectionFactory.builder().setAudioDeviceModule(device).createPeerConnectionFactory()
        val source=factory.createAudioSource(MediaConstraints())
        val trackA=factory.createAudioTrack("test-a",source);val trackB=factory.createAudioTrack("test-b",source)
        val observerA=Observer();val observerB=Observer()
        val config=PeerConnection.RTCConfiguration(emptyList())
        val a=factory.createPeerConnection(config,observerA)!!;val b=factory.createPeerConnection(config,observerB)!!
        try {
            a.addTrack(trackA,listOf("test-a"));b.addTrack(trackB,listOf("test-b"))
            val offer=Description().let { a.createOffer(it,MediaConstraints());it.waitFor()!! }
            assertTrue("Opus missing from native offer",offer.description.contains("opus/48000"))
            Description().also { a.setLocalDescription(it,offer) }.waitFor();Description().also { b.setRemoteDescription(it,offer) }.waitFor()
            val answer=Description().let { b.createAnswer(it,MediaConstraints());it.waitFor()!! }
            Description().also { b.setLocalDescription(it,answer) }.waitFor();Description().also { a.setRemoteDescription(it,answer) }.waitFor()
            val deadline=SystemClock.uptimeMillis()+20000;var receivedA=0L to 0L;var receivedB=0L to 0L
            while(SystemClock.uptimeMillis()<deadline) {
                while(observerA.candidates.isNotEmpty()) b.addIceCandidate(observerA.candidates.poll())
                while(observerB.candidates.isNotEmpty()) a.addIceCandidate(observerB.candidates.poll())
                SystemClock.sleep(250);receivedA=received(a);receivedB=received(b)
                if(receivedA.first>0&&receivedB.first>0&&receivedA.second>0&&receivedB.second>0) break
            }
            val directory=File(context.getExternalFilesDir(null),"verification").apply { mkdirs() }
            val audio=context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val outputDeadline=SystemClock.uptimeMillis()+3000
            while(SystemClock.uptimeMillis()<outputDeadline && audio.activePlaybackConfigurations.none { it.audioAttributes.usage==AudioAttributes.USAGE_GAME })SystemClock.sleep(100)
            val gameOutput=audio.activePlaybackConfigurations.any { it.audioAttributes.usage==AudioAttributes.USAGE_GAME }
            File(directory,"native-rtc.json").writeText(JSONObject().put("samplesReceivedA",receivedA.first).put("samplesReceivedB",receivedB.first).put("bytesReceivedA",receivedA.second).put("bytesReceivedB",receivedB.second).put("gameAudioOutput",gameOutput).put("physicalMicrophoneUsed",false).put("speakersMuted",true).toString())
            assertTrue("Voice must use the game/media output route",gameOutput)
            assertTrue("Android A received no decoded Opus packets: $receivedA",receivedA.first>0&&receivedA.second>0);assertTrue("Android B received no decoded Opus packets: $receivedB",receivedB.first>0&&receivedB.second>0)
            trackA.setEnabled(false);assertFalse(trackA.enabled())
        } finally { a.close();b.close();a.dispose();b.dispose();trackA.dispose();trackB.dispose();source.dispose();factory.dispose();device.release() }
    }
}
