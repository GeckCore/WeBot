import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';

export default {
    name: 'remini_hd',
    // Soporta .remini, .hd y .enhance
    match: (text) => /^\.(remini|hd|enhance)$/i.test(text),

    execute: async ({ sock, remitente, msg, downloadContentFromMessage }) => {
        // 1. Obtener idioma y traducciones
        const user = global.db.data.users[msg.sender] || {};
        const idioma = user.language || 'es';
        
        let tradutor;
        try {
            const pathLang = path.join(process.cwd(), 'src', 'languages', `${idioma}.json`);
            const _translate = JSON.parse(fs.readFileSync(pathLang, 'utf8'));
            tradutor = _translate.plugins.herramientas_hd;
        } catch (e) {
            // Fallback en caso de error de ruta
            tradutor = {
                texto1: '⚠️ Responde a una imagen o envía una con el comando.',
                texto2: ['❌ Formato no compatible', 'solo jpg/png'],
                texto3: '⏳ *Procesando imagen... esto puede tardar unos segundos.*',
                texto4: '❌ Error: '
            };
        }

        try {
            // 2. Detección agresiva de imagen (Normal, Citada, Efímera V1/V2)
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const q = quoted || msg.message;
            
            // Buscamos el nodo imageMessage en cualquier profundidad (para efímeros)
            const findImageNode = (obj) => {
                if (!obj) return null;
                if (obj.imageMessage) return obj.imageMessage;
                if (obj.viewOnceMessage?.message?.imageMessage) return obj.viewOnceMessage.message.imageMessage;
                if (obj.viewOnceMessageV2?.message?.imageMessage) return obj.viewOnceMessageV2.message.imageMessage;
                return null;
            };

            const imageNode = findImageNode(q);
            
            if (!imageNode) {
                return sock.sendMessage(remitente, { text: `${tradutor.texto1}` }, { quoted: msg });
            }

            const mime = imageNode.mimetype || "";
            if (!/image\/(jpe?g|png)/.test(mime)) {
                return sock.sendMessage(remitente, { text: `${tradutor.texto2[0]} (${mime}) ${tradutor.texto2[1]}` }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { text: tradutor.texto3 }, { quoted: msg });

            // 3. Descargar y subir imagen (Migrado a Catbox para mayor estabilidad)
            const stream = await downloadContentFromMessage(imageNode, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length === 0) throw new Error("No se pudo descargar la imagen de los servidores de WhatsApp.");

            const imageUrl = await uploadToCatbox(buffer);
            
            // 4. Llamar a la API de Stellar
            const hdImageBuffer = await upscaleWithStellar(imageUrl);

            // 5. Enviar resultado
            await sock.sendMessage(remitente, { 
                image: hdImageBuffer, 
                caption: '✨ *Imagen mejorada con IA*' 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en HD:', e);
            const errorMessage = e.response?.data?.message || e.message || 'Error desconocido';
            await sock.sendMessage(remitente, { text: tradutor.texto4 + errorMessage }, { quoted: msg });
        }
    }
};

/**
 * Sube un buffer a Catbox.moe
 * Más estable que Telegra.ph para VPS
 */
async function uploadToCatbox(buffer) {
    const ft = await fileTypeFromBuffer(buffer);
    if (!ft) throw new Error('No se pudo determinar el tipo de archivo.');
    
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { 
        filename: `image.${ft.ext}`, 
        contentType: ft.mime 
    });
    
    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
    });
    
    if (typeof res.data !== 'string' || !res.data.includes('https')) {
        throw new Error('Error al subir imagen a Catbox: ' + res.data);
    }
    
    return res.data.trim();
}

/**
 * Llama a la API de Stellar para el escalado
 */
async function upscaleWithStellar(url) {
    const endpoint = `https://api.stellarwa.xyz/tools/upscale?url=${url}&key=BrunoSobrino`;
    
    const { data } = await axios.get(endpoint, {
        responseType: "arraybuffer",
        headers: { "accept": "image/*" }
    });

    return Buffer.from(data);
}
