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

## Contrato JNI contrastado con DEX

Androguard confirmó estas firmas, sin copiar cuerpos de métodos al proyecto:

- realmsproxy.Engine(String, EventSink), request(String): String, close(): void, setEventSink(EventSink).
- realmsproxy.EventSink.onEvent(String): void.
- realmsproxy.Realmsproxy.newEngine(String, EventSink): Engine; lanAddress(): String.
- VcmcRealmsProxyHost mantiene bind/unbind y un executor para request; la interfaz Flutter no es el motor.
- aapt2 confirmó VcmcOverlayService: exported=false, stopWithTask=false y foregroundServiceType=0x82 (micrófono + reproducción). No inferir que esos atributos impidan que Android mate el proceso.

La documentación oficial consultada describe el SDK como herramienta de backend/extensiones, no como motor cliente móvil redistribuible. El Admin Toolkit tiene licencia PolyForm Noncommercial 1.0.0 y excluye control/verificaciones propietarios. No sustituye automáticamente nuestro puente de autenticación. Fuente: https://antoic.com/docs/vcmc.html (secciones SDK y Admin Toolkit).

## Servicio de burbuja contrastado con JADX 1.5.7

Se descompiló `com.naru.vcmc.VcmcOverlayService` del APK base real del XAPK2.3.5 proporcionado. Referencia privada fuera de Git: `C:/Users/Admin/.codex/private-analysis/vcmc-2.3.5/VcmcOverlayService.java`, SHA256 `fa1ae8035d7637ded0117decbf6e709de332cc21580ef0dce2e067df7cae82a9`. No se incorporan sus fuentes ni sus imágenes al launcher.

Observado: WindowManager TYPE_APPLICATION_OVERLAY2038, flags520 (NOT_FOCUSABLE + LAYOUT_NO_LIMITS), PixelFormat TRANSLUCENT, anclaje superior izquierdo, arrastre, menú expandido, mute/deafen, volumen, abrir aplicación y detener. Comprueba Settings.canDrawOverlays y retira la ventana al destruirse. Sus controles llaman a callbacks de MainActivity hacia Flutter. El cuerpo de este servicio no contiene startForeground; el atributo del manifiesto no prueba que lo ejecute por sí mismo.

Fonyx implementa ese comportamiento con código propio en FonyxVoiceBubble y lo conecta a su motor WebRTC compartido con PC. Añade un servicio de micrófono/reproducción con notificación y Headless JS para Android; START_NOT_STICKY evita prometer recuperación automática del micrófono tras muerte del proceso. PTT libera en UP/CANCEL y al cerrar. El indicador usa audioLevel real de las estadísticas WebRTC cuando hay un peer; queda negro sin transmisión y blanco al hablar. Sin peers no se calcula nivel. La ganancia Android sigue distancia/dimensión y volumen global; el paneo estéreo Android aún no está implementado.

Los contratos de señalización proceden del cliente PC previamente contrastado. La descompilación Android no demuestra por sí sola todos los opcodes Dart de2.3.5. Falta probar una cuenta real y audio entre Minecraft/dispositivos, cambio de red y treinta minutos con pantalla bloqueada. La prueba de burbuja en emulador no graba ni transmite audio.

Además se contrastó WebRtcSpeakerOutput con JADX: es un mezclador PCM con cola acotada, no demuestra selección de salida de AudioManager. No se reutilizó su implementación. En las cadenas de libapp.so ARM64 del XAPK se observó `minecraft://connect/?serverUrl=`. El adaptador Android usa esa ruta y conserva validación de dirección/puerto; Windows conserva su URI existente. Falta confirmar el resultado dentro de Minecraft Android real.


Extensión pedida por el usuario: controles por iconos y segundo overlay para PTT, con bloqueo, movimiento y posición persistente. No se afirma que ese segundo control proceda del APK original: es una función solicitada para Fonyx sobre la base WindowManager contrastada. Se añade FLAG_SPLIT_TOUCH a los overlays para que mantener pulsado PTT permita tocar Minecraft con otros dedos. Los recursos comunes son los iconos propios del launcher PC; no se extraen imágenes propietarias de VCMC.
