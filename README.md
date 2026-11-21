# Fonyx: trabajo de paridad PC / Android

Este árbol es de desarrollo. La APK Android todavía NO tiene la paridad requerida. No sustituye la versión de escritorio ni se publica en GitHub Releases.

- `docs/00-auditoria-android.md`: matriz y restricciones reales.
- `docs/vcmc-235-interoperabilidad.md`: hechos observados del cliente móvil; no contiene su código.
- `packages/core`: manifiestos, eventos, calendario, plan de addons, banco, identidad y señalización de voz. Sin Electron ni acceso al sistema; los adaptadores resuelven archivos, red y criptografía.
- `apps/desktop`: copia de trabajo de la base aportada, con quickfixes beta.6 conservados. La build original y el respaldo no se modifican.
- `apps/mobile`: vistas nativas React Native/Hermes y adaptador Kotlin de packs. Cuenta, voz, banco, administración y actualizador aún no están implementados con paridad.
- `MODLOG.md`: resultados, bloqueos, compilaciones y continuación.

## Pruebas locales

Ejecutar `npm ci` y `npm test` desde esta carpeta. La referencia de contratos PC beta.3 está congelada en test/reference, con hashes de procedencia; no se cambia para hacer pasar pruebas. Hay 44 tests, incluidos 17 existentes de PC sin modificar. No son pruebas de Android ni de una partida.

Android requiere JDK17, SDK36, build-tools36, NDK27 y las dependencias fijadas en package-lock. En este PC se localizaron dentro de Unity. `local.properties` es local, no se versiona. Java puede usar las CA de Windows con `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE`, sin desactivar TLS.

Ejecutar `node tools/build-stamp.cjs` desde la raíz antes de compilar Android. Desde apps/mobile/android: `gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon`. Si el NDK está fuera del SDK, añadir `-PfonyxNdkPath=<ruta del NDK 27.2.12479018>`. La versión de ambas builds se toma del package.json raíz.

Las pruebas Java de firmas y descargas se ejecutan con JDK17, igual que en `.github/workflows/contracts.yml`. El descargador conserva parciales tras un corte de red, valida Content-Range al continuar y comprueba el SHA completo antes de permitir la importación. Si el servidor ignora Range, reinicia el archivo; si rechaza el rango, lo descarta y permite reintentar desde cero.

La variante release de la plantilla usa firma **debug** exclusivamente para esta prueba. No es una clave de distribución ni debe usarse para publicar actualizaciones de usuarios. No introducir sesiones Microsoft, keystores privados ni binarios VCMC en este repositorio.
