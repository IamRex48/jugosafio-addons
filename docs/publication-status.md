# Estado observado — 20 de noviembre de 2026

Revisión de solo lectura de las releases públicas y del código local 1.2.15-beta.6. No se ejecutó una partida, no se publicó una actualización ni se modificaron assets.

## Fallo que bloquea las descargas

La API `releases/latest` devuelve `launcher-v1.2.0`. Su `launcher-content.json` contiene para Jugosafio:

`https://github.com/IamRex48/jugosafio-addons/releases/latest/download/event-manifest.json`

Ese manifiesto todavía referencia tres archivos de `v0.3.5` que ya no están en la lista de assets. Las tres URLs devolvieron **HTTP 404** en la revisión:

- `143fd6c0-c67c-4e36-9baa-68884ec01b62-1.0.0.mcpack`
- `cde3a46f-2e53-49cc-b16e-ea8c86bf1e2f-0.3.5.mcpack`
- `04657d52-888f-4947-b932-65fa3d63b56c-0.3.5.mcpack`

La verificación SHA-256 no puede arreglar una URL inexistente. Cambiar el README o añadir R2 tampoco repara por sí solo esa cadena. Es necesario preparar y verificar un conjunto de packs válido y publicar una configuración que lo referencie.

## Otra publicación disponible

`v0.3.5/event-manifest.json` contiene 13 entradas y usa varios archivos combinados `.mcaddon`. El código local 1.2.15 sí tiene `locatePack` para buscar packs anidados: el formato combinado no demuestra por sí mismo un fallo. Antes de usar ese manifiesto hay que comprobar el hash de cada archivo y encontrar dentro de él cada UUID/versión/tipo declarados, sin asumir compatibilidad con todos los clientes viejos.

No se cambió automáticamente el puntero al otro manifiesto: es una publicación distinta y no se validó su contenido completo contra el servidor activo.

## Configuración y fuentes

- La publicación consultada tiene `voiceEnabled: false` en Jugosafio y `bankEndpoint` vacío. El repo no demuestra que exista un servicio bancario activo.
- La raíz describe un launcher C# antiguo, con instrucciones de branding que ya no corresponden a la beta 1.2.15. Se conserva su guía como documentación histórica.
- Las fuentes Electron actuales están en las entregas locales, no en la rama principal consultada. Subirlas exige preparar una copia limpia que excluya motores privados, credenciales, cachés y binarios; no mezclar a ciegas el proyecto C# con el actual.

El nuevo comprobador detecta las tres referencias rotas, UUID repetidos, metadatos inválidos, dependencias declaradas ausentes y discrepancias entre SHA-256 declarados y digests de assets cuando GitHub los proporciona. La lectura de metadatos no reemplaza descargar y verificar el archivo real.
