# Revisión de la propuesta de servidor

## Orden de trabajo

1. **Coherencia de publicación:** documentar y detectar los enlaces rotos actuales. Esta revisión incluye el comprobador y sus tests; no cambia las releases.
2. **Publicación verificable:** preparar el conjunto real del servidor con el importador del launcher actual, mantener `schema: 1`, hashes, UUID, versiones y dependencias; probar antes de cambiar el puntero que reciben los jugadores.
3. **R2 y Worker:** conectar una cuenta autorizada, crear almacenamiento y un origen real. Conservar el espejo GitHub mientras haya clientes que lo necesiten. GitHub conectado no concede acceso a Cloudflare.
4. **Identidad y banco:** autenticar sesiones y recibir datos con una procedencia de servidor comprobable. El backend local ya existe como código experimental; no está demostrado su despliegue en producción.
5. **Transporte Aternos:** probar un único mensaje con la versión real del juego y el proxy antes de diseñar más funciones. Que un comando exista en `ProxyEngine` no demuestra que el launcher reciba todos los eventos del servidor ni que el proxy sea estable.

Cada fase debe tener su propio commit y pruebas. No usar publicaciones reales como fixtures de escritura ni modificar `FonyxEventTrust.exe` o el motor de voz.

## Correcciones necesarias a la propuesta

### Seguridad del banco

Microsoft confirma qué cuenta está llamando. **No confirma cuánto dinero tiene esa cuenta dentro de Jugosafio.** Un cliente puede mentir sobre un saldo aunque posea un token Microsoft válido. No aceptar saldo/alma enviados por un launcher como verdad del servidor sin un origen autenticado o prueba verificable emitida por el servidor. No incluir una clave compartida en un pack distribuido a jugadores. No activar escrituras de dinero desde el cliente.

### URLs y hashes

Los packs `packs/<sha256>.mcpack` son una buena opción inmutable, pero el servidor de publicación debe verificar el hash del objeto realmente almacenado antes de aceptar el manifiesto. Un nombre de archivo o un hash enviado por el cliente no es una comprobación.

Las URLs PUT firmadas de R2 usan el endpoint S3, no el dominio público de descarga. El Worker necesita credenciales de firma del lado servidor, cuotas y expiración de subidas. [Documentación oficial de R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

### Conflictos de publicación

Comprobar un ETag y escribir después son dos operaciones distintas y pueden competir. Usar una operación condicional real o una transacción para el estado de publicación. Cambiar `event-<id>.json` y `launcher-content.json` tampoco es atómico: preparar versiones inmutables y actualizar al final un único puntero autorizado evita que el cliente vea una mezcla. Mantener el espejo viejo sin romper la lectura `schema: 1`.

### Secretos del BDS

Si se dispone de un BDS propio, almacenar secretos mediante `secrets.json` y `@minecraft/server-admin.secrets`, no como variables accesibles al script ni dentro del pack. [Documentación oficial de BDS](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting?view=minecraft-bedrock-stable).

La afirmación de que Aternos no permite `server-net` no se considera confirmada por el prompt: depende del software y los permisos del alojamiento y debe contrastarse con el servidor real. Tampoco se considera probado que `scriptevent` sea un canal de lectura de cliente utilizable por el proxy.

## Pendiente externo

Para desplegar Cloudflare faltan una cuenta conectada con permisos sobre R2/Workers y el origen que se vaya a usar. La lista de admins debe validarse mediante XUID firmados, sin inventarlos a partir de gamertags. Estas condiciones no impiden ordenar y probar la publicación GitHub actual; sí impiden afirmar que la migración, el banco o el transporte ya están operativos.
