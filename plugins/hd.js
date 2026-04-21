import crypto from 'crypto'
import { fileTypeFromBuffer } from 'file-type'
import { promises as fsp } from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const fetchFn = fetch

export default {
  name: 'enhance',
  match: (text) => /^\.(hd|enhance|remini)$/i.test(text),
  execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
    try {
      // Determinar si el objetivo es el mensaje citado o el actual
      const targetMsg = quoted ? quoted : msg;
      const mediaInfo = getMediaInfo(targetMsg);

      if (!mediaInfo || mediaInfo.type !== 'image') {
        return sock.sendMessage(remitente, { text: `《✧》 Responde a una *imagen* con el comando .hd` }, { quoted: msg });
      }

      const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Mejorando calidad de la imagen..." }, { quoted: msg });

      // Descarga del buffer
      const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      if (!buffer || buffer.length < 10) {
        return sock.sendMessage(remitente, { text: '《✧》 Error al descargar la imagen.' }, { quoted: msg });
      }

      // Detección de tipo de archivo corregida
      const ft = await fileTypeFromBuffer(buffer);
      const inputMime = ft?.mime || 'image/jpeg';
      
      if (!/^image\/(jpe?g|png|webp)$/i.test(inputMime)) {
        return sock.sendMessage(remitente, { text: `《✧》 Formato *${inputMime}* no compatible.` }, { quoted: msg });
      }

      const result = await vectorinkEnhanceFromBuffer(buffer, inputMime);

      if (!result?.ok || !result?.buffer) {
        const errorMsg = result?.error?.message || 'Error en la API';
        return sock.sendMessage(remitente, { text: `《✧》 No se pudo mejorar la imagen: ${errorMsg}` }, { quoted: msg });
      }

      // Enviar resultado y borrar mensaje de espera
      await sock.sendMessage(remitente, { image: result.buffer, caption: "✅ Imagen mejorada con éxito" }, { quoted: msg });
      await sock.sendMessage(remitente, { delete: statusMsg.key });

    } catch (e) {
      console.error(e);
      await sock.sendMessage(remitente, { text: `❌ Error interno: ${e.message}` }, { quoted: msg });
    }
  }
}

// --- FUNCIONES INTERNAS ---

async function vectorinkEnhanceFromBuffer(inputBuf, inputMime) {
  const tmpDir = path.resolve('./tmp');
  if (!fsp.access(tmpDir).catch(() => false)) await fsp.mkdir(tmpDir, { recursive: true });

  const id = Date.now();
  const tmpPath = path.join(tmpDir, `hd_in_${id}.${inputMime.split('/')[1]}`);
  
  const out = { ok: false, buffer: null, error: null };

  try {
    await fsp.writeFile(tmpPath, inputBuf);
    const b64 = inputBuf.toString('base64');

    const response = await fetchFn('https://us-central1-vector-ink.cloudfunctions.net/upscaleImage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ data: { image: b64 } })
    });

    const json = await response.json().catch(() => ({}));
    const resultText = json?.result;
    if (!resultText) throw new Error("La API no devolvió resultados.");

    const innerJson = JSON.parse(resultText);
    const webpB64 = innerJson?.image?.b64_json;
    if (!webpB64) throw new Error("No se encontró la imagen procesada.");

    const webpBuf = Buffer.from(webpB64, 'base64');

    // Conversión de WebP (API) a PNG (WhatsApp HD) usando ffmpeg local
    const converted = await webpToPng(webpBuf, tmpDir, id);
    if (!converted.ok) throw new Error(converted.error);

    out.ok = true;
    out.buffer = converted.png;
    return out;

  } catch (e) {
    out.error = e;
    return out;
  } finally {
    if (fsp.access(tmpPath).catch(() => false)) await fsp.unlink(tmpPath);
  }
}

function webpToPng(webpBuf, tmpDir, id) {
  return new Promise(async (resolve) => {
    const inPath = path.join(tmpDir, `raw_${id}.webp`);
    const outPath = path.join(tmpDir, `final_${id}.png`);
    const ffmpegPath = path.resolve('./ffmpeg');

    await fsp.writeFile(inPath, webpBuf);

    const ff = spawn(ffmpegPath, ['-y', '-i', inPath, outPath]);
    
    ff.on('close', async (code) => {
      try {
        if (code === 0) {
          const png = await fsp.readFile(outPath);
          resolve({ ok: true, png });
        } else {
          resolve({ ok: false, error: "Error en la conversión de imagen." });
        }
      } catch (e) {
        resolve({ ok: false, error: e.message });
      } finally {
        await fsp.unlink(inPath).catch(() => {});
        await fsp.unlink(outPath).catch(() => {});
      }
    });
  });
}
