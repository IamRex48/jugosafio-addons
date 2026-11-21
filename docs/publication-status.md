# Publicación corregida — 21 de noviembre de 2026

Se corrigieron los assets reales de GitHub Releases. Esta operación no instala addons en Aternos ni publica un ejecutable nuevo.

## Publicación activa

- La release `launcher-v1.2.0` mantiene el endpoint `releases/latest` que consultan los clientes; su tag es histórico.
- `launcher-content.json` apunta, en el campo general y en Jugosafio, al manifiesto fijo `event-jugosafio-20261121-verified.json` de esa misma release. `event-manifest.json` es su espejo de compatibilidad.
- Hay 14 UUID únicos. Los 13 originales de `v0.3.5` se contrastaron con los archivos descargados: SHA-256, UUID, versión y tipo internos. Se añadió el RP requerido por el BP de voz 2.2.6.
- `VCMC-Recursos-Fonyx-Gris-2.2.6-HUD-Jugosafio-0.4.27.mcpack` deriva del parche gris local. Sus 12 archivos compartidos con el RP actual de Jugosafio se copiaron de este y se compararon byte por byte, incluido su HUD. Conserva UUID y versión requeridos y los créditos de Naru.
- Los JSON anteriores se conservan como assets `*-backup-repair-20261121-*.json`; no se eliminaron ni renombraron packs existentes.
- Ambas releases distinguen archivos activos, históricos, duplicados y límites de la revisión en sus descripciones.

Las tres URLs inexistentes dejaron de formar parte de la publicación activa. GitHub puede conservar temporalmente redirecciones antiguas; contrastar con la API de assets y las URLs por tag.

## Duplicado excluido

`JugoBoses.mcaddon` independiente contiene BP/RP 1.0.0. El combinado de Jugosafio incorpora los mismos UUID con versión 1.0.1. Solo se referencian estos últimos. La copia antigua permanece disponible, claramente señalada.

## Pendiente del conjunto del servidor

Portal Gun BP `610ea4ac-ce32-4d02-b55c-79c4319a2b4e` 1.1.1 declara dependencia RP `41ce5e06-7daa-4169-9e9b-9e32b835c4de` 1.1.1, mientras el combinado trae RP 1.1.2. Se registró la discrepancia sin alterar el addon dentro de una reparación de enlaces. Debe corregirse también en el conjunto que utiliza Aternos.

## Validación y límites

El comprobador remoto devuelve `ok: true`, sin assets ausentes ni diferencias con los digests publicados. Sus advertencias genéricas sobre `.mcaddon` no sustituyen la comprobación interna realizada.

No se probó una partida, el HUD renderizado ni voz con Aternos. Se conservaron `voiceEnabled: false`, `bankEndpoint` vacío y las direcciones. El EXE 1.2.0 sigue siendo histórico; las fuentes Electron actuales aún no están integradas en la rama principal.
