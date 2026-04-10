import axios from 'axios';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';

export default {
    name: 'mejorar_hd',
    // Captura .hd, .remini, .upscale o .enhance
    match: (text) => /^\.(hd|remini|upscale|enhance)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        // 1. Detección profunda de la imagen (Soporta imágenes normales y efímeras "Ver una vez")
        const q = quoted || msg.message;
        
        const findImageNode = (obj) => {
            if (!obj) return null;
            if (obj.imageMessage) return obj.imageMessage;
            if (obj.viewOnceMessage?.message?.imageMessage) return obj.viewOnceMessage.message.imageMessage;
            if (obj.viewOnceMessageV2?.message?.imageMessage) return obj.viewOnceMessageV2.message.imageMessage;
            return null;
        };

        const imageNode = findImageNode(q);
        
        if (!imageNode) {
            return sock.sendMessage(remitente, { text: '⚠️ *Uso:* Debes responder a una imagen con el comando `.hd`' }, { quoted: msg });
        }

        const mime = imageNode.mimetype || "";
        if (!/image\/(jpe?g|png)/.test(mime)) {
            return sock.sendMessage(remitente, { text: `❌ El formato detectado (${mime}) no es compatible. Solo JPG o PNG.` }, { quoted: msg });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: '⏳ *Analizando y mejorando calidad (Upscale)...*\nEsto puede tardar entre 10 y 30 segundos.' }, { quoted: msg });

        try {
            // 2. Descargar la imagen desde los servidores de WhatsApp de manera controlada sin afectar a sharp
            let buffer;
            try {
              const stream = await downloadContentFromMessage(imageNode, 'image');
              let buffers = [];
              for await (const chunk of stream) buffers.push(chunk);
              buffer = Buffer.concat(buffers);
            } catch (err) {
               throw new Error("No se pudo extraer el archivo. Es posible que el servidor de WhatsApp eliminara la imagen.");
            }

            if (!buffer || buffer.length === 0) throw new Error("Fallo al descargar la imagen original.");

            // 3. Subir a Catbox para obtener un enlace directo (Bypass antibot)
            const imageUrl = await uploadToCatbox(buffer);
            
            // 4. Procesar el Upscale con doble sistema de respaldo
            const hdImageBuffer = await upscaleImage(imageUrl);

            // 5. Enviar el resultado y borrar el mensaje de espera
            await sock.sendMessage(remitente, { 
                image: hdImageBuffer, 
                caption: '✨ *Imagen mejorada con IA*' 
            }, { quoted: msg });
            
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error('[PLUGIN HD] Error:', e);
            const errorMessage = e.response?.data?.message || e.message || 'Saturación en los servidores de IA.';
            await sock.sendMessage(remitente, { text: `❌ *Error técnico:*\n${errorMessage}`, edit: statusMsg.key });
        }
    }
};

/**
 * Sube un buffer a Catbox.moe (Estable para VPS y no banea rangos IP como Telegraph)
 */
async function uploadToCatbox(buffer) {
    const ft = await fileTypeFromBuffer(buffer);
    if (!ft) throw new Error('No se pudo determinar la extensión del archivo.');
    
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { 
        filename: `upscale.${ft.ext}`, 
        contentType: ft.mime 
    });
    
    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0 Safari/537.36'
        }
    });
    
    if (typeof res.data !== 'string' || !res.data.includes('https')) {
        throw new Error('Fallo en el servidor de Catbox: ' + res.data);
    }
    
    return res.data.trim();
}

/**
 * Aplica el filtro HD (Real-ESRGAN/Remini) mediante APIs gratuitas.
 * Incluye fallback para máxima fiabilidad.
 */
async function upscaleImage(url) {
    try {
        // Intento 1: Siputzx (Rápido y procesa x4)
        const { data } = await axios.get(`https://api.siputzx.my.id/api/tools/remini?url=${url}`, {
            responseType: "arraybuffer",
            headers: { "accept": "image/*" },
            timeout: 25000 // 25s max
        });
        return Buffer.from(data);
    } catch (err1) {
        console.log('[PLUGIN HD] Siputzx falló o tardó demasiado, intentando respaldo...');
        
        // Intento 2: Ryzendesu (Alternativa muy estable)
        const { data } = await axios.get(`https://api.ryzendesu.vip/api/ai/remini?url=${url}`, {
            responseType: "arraybuffer",
            headers: { "accept": "image/*", "User-Agent": "Mozilla/5.0" },
            timeout: 25000
        });
        return Buffer.from(data);
    }
}
