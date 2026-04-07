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
            // 2. Detectar si el mensaje o el citado es una imagen
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
            const isImage = q?.imageMessage || q?.viewOnceMessage?.message?.imageMessage || q?.viewOnceMessageV2?.message?.imageMessage;
            
            if (!isImage) {
                return sock.sendMessage(remitente, { text: `${tradutor.texto1}` }, { quoted: msg });
            }

            const mime = isImage.mimetype || "";
            if (!/image\/(jpe?g|png)/.test(mime)) {
                return sock.sendMessage(remitente, { text: `${tradutor.texto2[0]} (${mime}) ${tradutor.texto2[1]}` }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { text: tradutor.texto3 }, { quoted: msg });

            // 3. Descargar y subir imagen para obtener URL
            const stream = await downloadContentFromMessage(isImage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length === 0) throw new Error("No se pudo descargar la imagen.");

            const imageUrl = await uploadToTelegraph(buffer);
            
            // 4. Llamar a la API de Stellar
            const hdImageBuffer = await upscaleWithStellar(imageUrl);

            // 5. Enviar resultado
            await sock.sendMessage(remitente, { 
                image: hdImageBuffer, 
                caption: '✨ *Imagen mejorada con IA*' 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en HD:', e);
            const errorMessage = e.response?.data?.message || e.message || e;
            await sock.sendMessage(remitente, { text: tradutor.texto4 + errorMessage }, { quoted: msg });
        }
    }
};

/**
 * Sube un buffer a Telegra.ph para obtener una URL pública
 * Corregido para evitar error 400 (Bad Request)
 */
async function uploadToTelegraph(buffer) {
    const ft = await fileTypeFromBuffer(buffer);
    if (!ft) throw new Error('No se pudo determinar el tipo de archivo multimedia.');
    
    const form = new FormData();
    // Es vital pasar el filename y el contentType para que Telegra.ph no devuelva 400
    form.append('file', buffer, { 
        filename: `image.${ft.ext}`, 
        contentType: ft.mime 
    });
    
    const res = await axios.post('https://telegra.ph/upload', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
    });
    
    if (!res.data || !res.data[0] || !res.data[0].src) {
        throw new Error('La respuesta del servidor de imágenes fue inválida.');
    }
    
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
