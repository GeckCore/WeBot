import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';

export default {
    name: 'remini_hd',
    // Soporta .remini, .hd y .enhance
    match: (text) => /^\(|hd|enhance)$/i.test(text),

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
            // 2. Detectar si el mensaje o el citado es una imagen
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
            const mime = q?.imageMessage?.mimetype || "";

            if (!/image\/(jpe?g|png)/.test(mime)) {
                return sock.sendMessage(remitente, { text: `${tradutor.texto1}` }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { text: tradutor.texto3 }, { quoted: msg });

            // 3. Descargar y subir imagen para obtener URL
            const stream = await downloadContentFromMessage(q.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const imageUrl = await uploadToTelegraph(buffer);
            
            // 4. Llamar a la API de Stellar
            const hdImageBuffer = await upscaleWithStellar(imageUrl);

            // 5. Enviar resultado
            await sock.sendMessage(remitente, { 
                image: hdImageBuffer, 
                caption: '✨ *Imagen mejorada con IA*' 
            }, { quoted: msg });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(remitente, { text: tradutor.texto4 + e.message }, { quoted: msg });
        }
    }
};

/**
 * Sube un buffer a Telegra.ph para obtener una URL pública
 */
async function uploadToTelegraph(buffer) {
    const { ext } = await fileTypeFromBuffer(buffer);
    const form = new FormData();
    form.append('file', buffer, `tmp.${ext}`);
    
    const res = await axios.post('https://telegra.ph/upload', form, {
        headers: form.getHeaders()
    });
    
    return 'https://telegra.ph' + res.data[0].src;
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
