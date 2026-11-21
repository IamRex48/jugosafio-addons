# Auditoría de paridad Android — 21 de noviembre de 2026

Estado: investigación y extracción, NO APK terminada. Ninguna fila sin prueba Android se considera verde.

## Fuentes de verdad

Base solicitada: `RESPALDO-ULTIMA-BUENA-PC-1.2.15-beta.3/Fuentes`, original conservado. Comparar también beta.6 para conservar las mejoras posteriores de audio opcional, arranque y menú de usuario. Las entregas originales no se editan: se prepara un árbol de trabajo compartido. Los archivos de fuentes de beta.3 y beta.6 no contienen carpeta test, aunque package.json anuncia node --test; no afirmar que esos tests se ejecutaron. El proyecto FonyxLauncher más antiguo sí tiene tests: hay que comprobar cuáles corresponden a cada contrato.

Referencia VCMC aportada: 2.3.5, versionCode 137, paquete com.naru.vcmc, minSdk 24, targetSdk 36. SHA-256 XAPK: `91cb19dede0d0843c4bb0cd2b07029dc44fbed84e7fa5718d656df70f326bb9a`.

## Matriz de paridad

| Función PC / evidencia | Equivalente Android propuesto | Prueba exigida | Estado Android |
|---|---|---|---|
| Eventos, feed y contenido: core.validateFeed/validateContent | packages/core + fetch, lista de fuentes | mismas entradas y errores; caída de primera fuente | Pendiente |
| Calendario y avisos: calendar.js | mismo módulo JS + vistas nativas | mismos filtros, fechas y publicación | Pendiente |
| Descarga y SHA: core.download | downloader nativo a almacenamiento propio + SHA-256 | hash incorrecto, cortes, datos móviles y poco espacio | Pendiente |
| UUID, versiones, dependencias: github-publish.packPlan | función compartida, extractor de ZIP nativo | mismas advertencias y selección final | Pendiente |
| Instalar, detectar y retirar packs | FileProvider + Intent VIEW, SAF solo donde permita | importación real y resultado confirmado; no asumir éxito por volver a la app | Bloqueo de paridad por investigar |
| Cuenta, perfil y logout: AddonBridge | autenticación propia + Keystore + adaptador de identidad | xuid/gamertag firmados, nonce, expiración, sesión ajena | Pendiente |
| Verificación automática: AddonBridge + engine | implementación propia del contrato Android del puente | server_connected real y confirmación addon; timeout visible | Pendiente |
| Banco: BankClient | lógica de sesión compartida; tokens en módulo nativo | challenge/session/me, cambio de xuid, replay, caída | Backend no configurado en producción |
| Voz: relay-protocol/relay-session/voice-audio | protocolo JS compartido + WebRTC nativo y Opus | audio bidireccional, mute/deafen/PTT y volúmenes | Pendiente |
| Voz en segundo plano | servicio microphone/mediaPlayback + notificación | Minecraft visible y pantalla apagada 30 min, cambio de red | Requiere dispositivo real |
| Ajustes, primera vez y menú de cuenta | React Native, controles nativos, preferencias persistidas | cada pantalla y reinicio sin repetir onboarding | Pendiente |
| Admin y publicación: github-publish | plan compartido + adaptador de ZIP/red/archivos | conflicto de base, permiso admin, no publicar durante tests | Pendiente |
| Idioma/textos | conservar español y mensajes existentes; no inventar selector ausente | comparación de textos y errores | Pendiente |
| Intro, logos y animaciones | imágenes Fonyx y Animated con Reduce Motion | capturas móvil/tablet vs PC; sin WebView | Pendiente |
| Teclas globales M/N/V | burbuja, notificación y PTT táctil | pulsar, soltar/cancelar y app en segundo plano | Pendiente |
| Bandeja Windows | notificación persistente; overlay opcional autorizado | cerrar actividad no corta voz; parada explícita sí | Pendiente |
| Estado de servidor: bedrock-ping | módulo UDP nativo + mismo contrato de estado | encendido/apagado, DNS y timeout | Pendiente |
| Discord RPC | no existe equivalente directo demostrado al IPC desktop | comprobar SDK/API permitidos; no simular actividad | Bloqueo de paridad por investigar |
| Actualizador desktop | APK propia firmada, SHA y PackageInstaller/Intent | actualización misma firma; rechazo otra firma | Pendiente |

## Dependencias de Windows

- FonyxEventTrust.exe: no ejecutable en Android. Probar el intent minecraft:// real. Un intent no demuestra eliminar confirmaciones o registrar servidores; no parchear Minecraft ni saltar controles de propiedad.
- FonyxVoiceKeys.exe: sustituir por acciones táctiles/servicio; no prometer captura de teclas globales Android.
- vcmc_realms_proxy.exe: binario Windows privado, sin fuentes en la entrega. El XAPK sí incluye libgojni.so ARM64 y wrappers realmsproxy.Engine, pero no se pueden redistribuir ni convertir en nuestro motor por copiar ese binario.
- AppData/com.mojang: almacenamiento privado + FileProvider. SAF no concede acceso general a Android/data en Android 11+. No declarar un pack instalado basándose solo en una marca local.
- shell.openExternal: Intent ACTION_VIEW con comprobación de actividad resoluble y errores.
- Discord RPC: integración de escritorio no portátil de forma automática.
- NSIS/portable: sustituido por APK y actualizador firmado.

## Evidencia de arquitectura

React Native + Hermes es candidato porque reutiliza JavaScript con vistas nativas. Aún no es una decisión validada en dispositivo. Kotlin/Compose con una segunda implementación de lógica incumpliría compartir el core JS salvo que incorpore un motor JS propio. Flutter (usado por VCMC) no permite reutilizar directamente nuestro core JS sin otro runtime.

core.js actual NO es portable sin extracción: importa fs/path/crypto/net/stream/child_process/yauzl al cargar. relay-protocol usa Buffer y TextDecoder; verifyIdentity usa crypto de Node; BankClient mezcla red, disco y sesión. No basta con copiar esos archivos a React Native.

Primera prueba: extraer validaciones/calendario/plan sin Node, ejecutar mismas fixtures en PC y un runtime aislado sin require/Buffer, después en Hermes y en una actividad Android real. Hasta ejecutar lo último no marcar arquitectura verde.

## Restricciones comprobadas en documentación oficial

Android 14 comprueba permisos mientras la app está visible al crear un servicio microphone: iniciarlo antes de abrir Minecraft. No intentar reactivarlo silenciosamente desde background después de que el sistema lo mate. [Android foreground services](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).

Android 11 restringe datos privados de otras apps y SAF no da acceso general a Android/data. Eliminar o inventariar packs internos no queda resuelto por FileProvider. [Almacenamiento Android 11](https://developer.android.com/about/versions/11/privacy/storage).

No se ha probado Minecraft Android ni su confirmación de importación. Android 10/11/12/13/14/15: todos pendientes de prueba; no presentar las reglas documentadas como resultados de dispositivo.

## Entorno y próximos pasos

Inicialmente hay Java 11, sin adb/gradle/SDK en PATH ni SDK en LocalAppData/Android. Se preparan herramientas oficiales en LocalAppData/FonyxDev sin reemplazar Java global. No hay dispositivo Android confirmado. No se generó una clave de distribución ni se solicitarán credenciales mientras el usuario duerme. Puede usarse firma debug exclusivamente para pruebas identificadas como tales.

Fase 5 del documento de servidor mencionado: el adjunto de servidor disponible solo contiene fases 1–4. El timeout aproximado de 25 s y server_connected se tratarán como requisitos explícitos de este encargo, sin inventar contenido de una Fase 5 ausente.

La publicación actual conserva voz desactivada y banco sin endpoint; esos servicios no se vuelven operativos al portar la UI.
