// plugins/upload.js — Comando .upload / .up (sube archivos a la nube vía API EvoGB)
// Uso:
//   .up                → sube el archivo del mensaje al que respondes
//   .up <url directa>  → re-sube un archivo desde otra URL
//   .up img|video|doc  → sube el archivo multimedia del MISMO mensaje

const API_KEY = 'geckcore';
const API_URL = 'https://api.evogb.org/tools/upload';

const TAMAÑO_MAX = 100 * 1024 * 1024; // 100 MB de seguridad

// Extensión según mimetype
const extPorMimetype = (mime = '') => {
  const mapa = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'application/zip': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return mapa[mime.split(';')[0].trim()] || 'bin';
};

// Extrae una URL http(s) del texto
const sacarUrl = (texto) => {
  const m = (texto || '').match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
};

// Subida vía URL (GET con query params)
const subirPorUrl = async (url, description = '') => {
  const params = new URLSearchParams({
    key: API_KEY,
    server: 'evogb',
    method: 'url',
    url,
    author: 'GeckCore',
  });
  if (description) params.set('description', description);

  const res = await fetch(`${API_URL}?${params.toString()}`);
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[UPLOAD] Respuesta no JSON:', raw.substring(0, 200));
    throw new Error('La API devolvió una respuesta inválida.');
  }
};

// Subida local (POST multipart, campo obligatorio: 'file')
const subirLocal = async (buffer, filename, mimetype, description = '') => {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || 'application/octet-stream' });
  form.append('file', blob, filename);

  const params = new URLSearchParams({
    key: API_KEY,
    server: 'evogb',
    method: 'local',
    author: 'GeckCore',
  });
  if (description) params.set('description', description);

  const res = await fetch(`${API_URL}?${params.toString()}`, {
    method: 'POST',
    body: form,
  });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[UPLOAD] Respuesta no JSON:', raw.substring(0, 200));
    throw new Error('La API devolvió una respuesta inválida.');
  }
};

export default {
  name: 'upload',
  match: (text) => /^\.up(load)?(\s|$)/i.test((text || '').trim()),

  execute: async ({ sock, remitente, msg, textoLimpio, quoted, getMediaInfo, downloadContentFromMessage }) => {
    try {
      const args = textoLimpio.replace(/^\.up(load)?\s*/i, '').trim();
      let dataApi = null;
      let origen = '';

      // ---- Modo 1: .up <url> ----
      const urlArg = sacarUrl(args);
      if (urlArg) {
        await sock.sendMessage(remitente, { text: '☁️ *UPLOAD:* Re-subiendo ese archivo a la nube...' }, { quoted: msg });
        dataApi = await subirPorUrl(urlArg);
        origen = 'URL externa';
      }

      // ---- Modo 2: .up img|video|doc (archivo en este mismo mensaje) ----
      if (!dataApi && /^(img|imagen|video|audio|doc|documento|sticker)$/i.test(args)) {
        const media = getMediaInfo(msg.message);
        if (!media) {
          return sock.sendMessage(remitente, {
            text: `⚠️ Este mensaje no contiene *${args.toLowerCase()}*.\nEnvía el archivo junto con el comando o responde a él con .up`
          }, { quoted: msg });
        }
        await sock.sendMessage(remitente, { text: '☁️ *UPLOAD:* Descargando y subiendo archivo...' }, { quoted: msg });
        const stream = await downloadContentFromMessage(media.msg, media.type === 'sticker' ? 'image' : media.type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const mime = media.msg.mimetype || `application/${media.type}`;
        const nombreOriginal = media.msg.fileName || `archivo_${Date.now()}.${extPorMimetype(mime)}`;
        dataApi = await subirLocal(buffer, nombreOriginal, mime);
        origen = `${media.type} (mensaje actual)`;
      }

      // ---- Modo 3: .up respondiendo a un mensaje con archivo ----
      if (!dataApi && quoted) {
        const media = getMediaInfo(quoted);
        if (media) {
          const rawLen = Number(media.msg?.fileLength?.toString?.() ?? media.msg?.fileLength ?? 0);
          if (rawLen > TAMAÑO_MAX) {
            return sock.sendMessage(remitente, { text: `❌ El archivo pesa demasiado (${Math.round(rawLen / 1024 / 1024)} MB). Máximo: ${TAMAÑO_MAX / 1024 / 1024} MB.` }, { quoted: msg });
          }
          await sock.sendMessage(remitente, { text: '☁️ *UPLOAD:* Subiendo archivo a la nube...' }, { quoted: msg });
          const stream = await downloadContentFromMessage(media.msg, media.type === 'sticker' ? 'image' : media.type);
          let buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          const mime = media.msg.mimetype || `application/${media.type}`;
          const nombreOriginal = media.msg.fileName || `archivo_${Date.now()}.${extPorMimetype(mime)}`;
          dataApi = await subirLocal(buffer, nombreOriginal, mime);
          origen = `${media.type} (mensaje citado)`;
        }
      }

      // ---- Sin argumento ni archivo citado ----
      if (!dataApi) {
        return sock.sendMessage(remitente, {
          text: '☁️ *UPLOAD — GECKCORE CLOUD*\n\n' +
                '*Uso:*\n' +
                '• Responde a un archivo (imagen, video, audio, documento o sticker) con `.up`\n' +
                '• `.up <url-directa>` → re-subir un archivo desde otro enlace\n' +
                '• `.up img` / `.up video` / `.up doc` → subir el archivo de este mismo mensaje\n\n' +
                'Devuelve el enlace directo del archivo alojado.'
        }, { quoted: msg });
      }

      // ---- Procesar respuesta ----
      console.log('[UPLOAD] Respuesta API:', JSON.stringify(dataApi).substring(0, 500));

      if (!dataApi.status || !dataApi.url) {
        throw new Error(dataApi.message || 'La API no devolvió ningún enlace.');
      }

      const d = dataApi.data || {};
      const info = `✅ *ARCHIVO SUBIDO A LA NUBE*\n\n` +
        `🔗 *Enlace:* ${dataApi.url}\n` +
        (d.name ? `📄 *Nombre:* ${d.name}\n` : '') +
        (d.size ? `📦 *Tamaño:* ${d.size}\n` : '') +
        (d.expires_at ? `⏳ *Expira:* ${new Date(d.expires_at).toLocaleString('es-AR')}\n` : '') +
        `🛰️ *Servidor:* ${dataApi.server || 'evogb'}\n` +
        `📡 *Origen:* ${origen}`;

      await sock.sendMessage(remitente, { text: info }, { quoted: msg });
    } catch (err) {
      console.error('[UPLOAD ERROR]:', err);
      await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
    }
  }
};
