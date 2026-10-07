# WeBot

## Configuración recomendada (Heroku)

### Variables de entorno
- `OWNER_NUMBER` (requerida): número o JID del propietario autorizado.
  - Ejemplos válidos: `34600000000`, `34600000000@s.whatsapp.net`, `34600000000@c.us`.
- `GROUPS_ENABLED_BY_DEFAULT` (opcional, default `false`):
  - `false` = modo privado por defecto (no responde en grupos salvo comando permitido de activación).
  - `true` = modo público en grupos por defecto.
- `FFMPEG_PATH` (opcional): ruta explícita al binario `ffmpeg`.
- `MONGODB_URI` (recomendada para Heroku): URI de conexión de MongoDB Atlas gratuita (`mongodb+srv://...`).
  - **Evita la pérdida de sesión cada 24 horas:** Heroku borra el disco local diariamente; con esta variable configurada, las credenciales (`auth_info_baileys`) y la base de datos (`database.json`) se sincronizan automáticamente en la nube y se restauran en cada reinicio sin pedir código QR.

### Heroku buildpacks
Este repositorio incluye `app.json` con:
1. `heroku-community/apt`
2. `heroku/nodejs`

Y un `Aptfile` con `ffmpeg` para que el binario esté disponible en runtime.

### Notas operativas
- El bot valida acceso de propietario de forma centralizada y normaliza IDs para evitar problemas de formato de remitente.
- El comando de stickers valida disponibilidad de `ffmpeg` y devuelve un error accionable cuando falta el binario.
- Si no se define `MONGODB_URI`, el bot opera en modo almacenamiento local transparente (ideal para desarrollo en PC).