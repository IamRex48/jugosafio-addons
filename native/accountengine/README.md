# Identidad Microsoft nativa

Implementación propia con dependencias públicas fijadas en go.mod/go.sum. No contiene código ni binarios del motor VCMC. Gomobile genera una biblioteca llamada libgojni.so; ese nombre es genérico del compilador y no indica reutilización de la biblioteca propietaria de referencia.

Go 1.27.4; gomobile/gobind v0.0.0-20261117202452-47699113848a. Preparar ambos ejecutables con go install, JAVA_HOME, ANDROID_HOME y ANDROID_NDK_HOME (NDK27.2). En Windows el NDK necesita una ruta sin espacios; se creó un enlace local a Unity sin modificar su instalación.

Desde esta carpeta: gomobile bind -target android/arm64,android/amd64 -androidapi 29 -ldflags='-extldflags=-Wl,-z,max-page-size=16384' -javapkg studios.fonyx.auth -o ../../apps/mobile/android/app/libs/fonyx-account.aar .

La AAR es generada y no se versiona. CI ya ejecuta las pruebas Go y construye ARM64+x86_64 desde estas fuentes antes de Gradle; ese paso ha aprobado en GitHub.

Cuatro pruebas Go aprobadas: firma P384 vinculada al nonce, destinos HTTPS/errores sin secretos, cancelación y rechazo previo de desafíos inválidos. Prueba pública anónima: recibió código Microsoft, canceló y guardó cero cuentas. No equivale a un login real completado.

Pendientes: prueba Android de Keystore/JNI y login completo; licencias de todas las dependencias en la distribución; validación de audio WebRTC/servicio/burbuja en un teléfono real. La APK aún no cumple la paridad solicitada. Administración móvil queda fuera por petición del usuario; escritorio conserva sus funciones.

Se exige alineación ELF16KiB para dispositivos Android15+: la AAR anterior quedaba en4KiB y se corrigió el enlace externo. Las dos ABI generadas presentan segmentos PT_LOAD16KiB; falta ejecución en hardware16KiB. Referencia: https://developer.android.com/guide/practices/page-sizes
