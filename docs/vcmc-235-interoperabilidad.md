# VCMC Android 2.3.5 — observaciones para interoperabilidad

Análisis estático del XAPK suministrado, no ejecución ni sesión autenticada. Sin copiar código o recursos del fabricante al proyecto.

- Base APK contiene assets/flutter_assets: cliente Flutter, no React Native.
- Split ARM64 contiene libflutter.so, libapp.so (Dart AOT), libgojni.so (Go/JNI), libjingle_peerconnection_so.so (WebRTC), libopus.so y bibliotecas de audio.
- DEX contiene com.naru.vcmc.VcmcOverlayService, VcmcRealmsProxyHost, VcmcAudioDsp y WebRtcSpeakerOutput.
- Exports JNI observados: Java_realmsproxy_Realmsproxy_newEngine, Engine_request, Engine_close y Engine_setEventSink, además de lanAddress. Prueba que existe un transporte móvil; no demuestra disponibilidad de sus fuentes ni licencia de reutilización.
- libapp.so contiene referencias identity_proof, server_connected y vcmc:verify. No se deducen esquemas completos, tiempos ni opcodes de la mera presencia de cadenas.
- Referencia de relay observada: wss://ws.antoic.com:8443. También hay catálogo de compatibilidad público y documentación de VCMC en antoic.com/docs/vcmc.html. No se han contactado salas ni enviado credenciales.
- El manifiesto externo del XAPK declara RECORD_AUDIO, SYSTEM_ALERT_WINDOW, POST_NOTIFICATIONS, WAKE_LOCK y FOREGROUND_SERVICE_MICROPHONE/MEDIA_PLAYBACK. Debe contrastarse con el AndroidManifest binario; no copiar todos sus permisos, publicidad o compras a Fonyx.

Pendiente: descompilar solo wrappers Android fuera del repositorio para documentar request/eventSink y ciclo de vida del overlay; cotejar con el contrato PC, obtener trazas reales y reimplementar con código propio. Revisar condiciones/licencias antes de cualquier distribución. No extraer libgojni.so a la APK Fonyx.
