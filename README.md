# Fonyx: trabajo de paridad PC / Android

Este árbol es de desarrollo. La APK Android todavía NO tiene la paridad requerida. No sustituye la versión de escritorio ni se publica en GitHub Releases.

- `docs/00-auditoria-android.md`: matriz y restricciones reales.
- `docs/vcmc-235-interoperabilidad.md`: hechos observados del cliente móvil; no contiene su código.
- `packages/core`: validación de manifiestos, plan de addons, calendario y agrupación de descargas. Sin Electron ni acceso al sistema.
- `apps/desktop`: copia de trabajo de la base aportada, con quickfixes beta.6 conservados. La build original y el respaldo no se modifican.
- `apps/mobile`: vistas nativas React Native/Hermes y adaptador Kotlin de packs. Cuenta, voz, banco, administración y actualizador aún no están implementados con paridad.
- `MODLOG.md`: resultados, bloqueos, compilaciones y continuación.

## Pruebas locales

Ejecutar `npm ci` y `npm test` desde esta carpeta. La referencia de contratos PC beta.3 está congelada en test/reference, con hashes de procedencia; no se cambia para hacer pasar pruebas. Los tests comparan contratos con esa referencia y ejecutan seis pruebas existentes de PC sin modificaciones. No son pruebas de Android ni de una partida.

Android requiere JDK17, SDK36, build-tools36, NDK27 y las dependencias fijadas en package-lock. En este PC se localizaron dentro de Unity. `local.properties` es local, no se versiona. Java puede usar las CA de Windows con `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE`, sin desactivar TLS.

Desde apps/mobile/android: `gradlew.bat :app:assembleRelease :app:assembleDebug :app:assembleDebugAndroidTest -PreactNativeArchitectures=arm64-v8a,x86_64 --max-workers=2 --no-daemon`.

La variante release de la plantilla usa firma **debug** exclusivamente para esta prueba. No es una clave de distribución ni debe usarse para publicar actualizaciones de usuarios. No introducir sesiones Microsoft, keystores privados ni binarios VCMC en este repositorio.
