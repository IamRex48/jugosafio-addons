# Fonyx · publicación de Jugosafio

Este repositorio aloja las publicaciones que consulta Fonyx Launcher. La raíz todavía incluye las fuentes del **prototipo antiguo en C#**; no son las fuentes de la versión Electron 1.2.15 que se está probando en PC.

## Dónde está cada cosa

| Ubicación | Uso |
|---|---|
| Releases → `launcher-v1.2.0` | Configuración que actualmente resuelve `releases/latest`, lista de administradores y un EXE antiguo. El nombre del tag no identifica la versión del launcher en pruebas. |
| Releases → `v0.3.5` | Archivos de addons aportados para el servidor y otro manifiesto. El nombre del tag tampoco representa la versión de todos los addons que contiene. |
| `docs/publication-status.md` | Fallos observados, fuentes activas y alcance de la revisión. |
| `docs/server-migration.md` | Revisión de la propuesta R2/Worker y pasos que aún requieren alojamiento y pruebas reales. |
| `scripts/check-publication.cjs` | Comprobador de configuración, referencias a assets, hashes declarados y UUID. Solo lee; no publica ni elimina. |
| `Launcher.cs`, `SelfTest.cs`, `build.ps1`, `publish.py`, `test_publish.py`, `config.json`, `branding/` | Prototipo anterior conservado para recuperación. Su guía original está en `docs/legacy-launcher.md`. |

## Comprobar antes de publicar

Con Node.js 22 o posterior, sin instalar dependencias:

```powershell
npm test
npm run check:publication
```

En Windows con una CA corporativa instalada, usar `node --use-system-ca scripts/check-publication.cjs` con una versión de Node que soporte ese parámetro. No desactivar TLS. El comprobador puede usar `GITHUB_TOKEN` para leer la API, pero no lo imprime y no lo envía a enlaces de descarga.

`npm test` verifica el comprobador con datos simulados. `check:publication` consulta la publicación real y termina con código 1 si descubre problemas; no significa que los tests hayan fallado. No descarga los packs completos ni sustituye las validaciones del importador de Fonyx.

## Regla de mantenimiento

La configuración del launcher, el manifiesto de cada evento y los archivos que este referencia deben corresponder entre sí. No borrar un asset mientras algún manifiesto activo lo siga utilizando. Mantener SHA-256, UUID, versión y dependencias. No cambiar `latest` al publicar una build experimental sin revisar el efecto en los clientes antiguos.

El contenido de Minecraft y los binarios no se versionan aquí por esta revisión. No se han añadido tokens, cachés Microsoft, fuentes decompiladas ni los motores nativos privados. La migración de alojamiento todavía no está desplegada.
