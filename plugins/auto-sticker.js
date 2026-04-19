import fs from 'fs';
import path from 'path';

// ==========================================
// DICCIONARIO DE PALABRAS CLAVE Y STICKERS
// Añade aquí la palabra (en minúscula) y el nombre de su archivo.
// ==========================================
const dictionary = {
    'mujeres': 'mujeres.webp',
    'mujere': 'mujeres.webp',
    'women': 'mujeres.webp',
    'womens': 'mujeres.webp',
    'mierda': 'mierda.webp',
    'psoe': 'psoe.webp',
    'jaja': 'jajaja.webp',
    'jajaja': 'jajaja.webp',
    'jsjs': 'jajaja.webp',
    'pipipi': 'pipipi.webp',
    'ok': 'okey.webp',
    'vale': 'okey.webp',
    ':3': '3.webp',
    'psoe': 'psoe.webp',
    'mmm': 'ujumm.webp',
    'ujumm': 'ujumm.webp',
    'miedo': 'miedo.webp',
    'voy': 'voy.webp',
    'vamos': 'voy.webp',
    'chino': 'chino.webp',
    'poeta': 'poeta.webp',
    'poema': 'poeta.webp',
    'psoe': 'psoe.webp',
    'nazi': 'nazi.webp',
    'me la pela': 'melapela.webp',
    '-1000 aura': 'aura.webp',
    'fuentes': 'fuentes.webp',
    'sospechoso': 'desconfianza.webp',
    'noo': 'noo.webp',
    'rico': 'rico.webp',
    'riko': 'rico.webp',
    'jura': 'lookhe.webp',
    'look': 'lookhe.webp',
    'riko': 'rico.webp',
    'bruh': 'stop.webp',
    'para': 'stop.webp',
    'basta': 'stop.webp',
    'piensa': 'think.webp',
    'que': 'think.webp',
    'enserio': 'think.webp',
    'vamos': 'goo.webp',
    'gg': 'goo.webp',
    'love': 'love.webp',
    'guapa': 'love.webp',
    'calla': 'silence.webp',
    'silencio': 'silence.webp',
    'paz': 'peace.webp',
    'tranquidad': 'peace.webp',
    'chill': 'peace.webp',
    'baila': 'dance.webp',
    'fiesta': 'dance.webp',
    'discoteca': 'dance.webp',
    'riko': 'rico.webp',
    'shutup': 'shutup.webp',
    'trabajo': 'job.webp',
    'trabajar': 'job.webp',
    'beca': 'job.webp',
    'bequita': 'job.webp',
    'reza': 'jobapp.webp',
    'recemos': 'jobapp.webp',
};

const triggers = Object.keys(dictionary);

export default {
    name: 'auto_stickers',
    
    // El plugin se activa si detecta el comando de encendido/apagado, 
    // o si detecta alguna de las palabras clave exactas en el texto.
    match: (text) => {
        if (/^\.(autosticker|as)\s+(on|off)$/i.test(text)) return true;
        
        const lower = text.toLowerCase();
        return triggers.some(word => new RegExp(`\\b${word}\\b`, 'i').test(lower));
    },

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // Asegurar que exista la configuración del chat en la DB
        if (!global.db.data.chats[remitente]) {
            global.db.data.chats[remitente] = { autosticker: false };
        }

        const isGroup = remitente.endsWith('@g.us');
        
        // 1. GESTIÓN DEL COMANDO (ON/OFF)
        const commandMatch = textoLimpio.match(/^\.(autosticker|as)\s+(on|off)$/i);
        if (commandMatch) {
            const state = commandMatch[2].toLowerCase() === 'on';
            global.db.data.chats[remitente].autosticker = state;
            
            return sock.sendMessage(remitente, { 
                text: `✅ *Auto-Stickers:* ${state ? 'ENCENDIDOS' : 'APAGADOS'} en este chat.` 
            }, { quoted: msg });
        }

        // 2. DETECCIÓN Y ENVÍO (Solo si está encendido)
        if (!global.db.data.chats[remitente].autosticker) return;

        // Crear carpeta media si no existe por seguridad
        const mediaDir = path.join(process.cwd(), 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);

        // Extraer todas las palabras del mensaje
        const palabras = textoLimpio.toLowerCase().match(/\b\w+\b/g) || [];

        for (const palabra of palabras) {
            if (dictionary[palabra]) {
                const stickerPath = path.join(mediaDir, dictionary[palabra]);

                // Comprobar si el archivo físico realmente existe en la carpeta /media
                if (fs.existsSync(stickerPath)) {
                    await sock.sendMessage(remitente, { 
                        sticker: { url: stickerPath } 
                    }, { quoted: msg });
                    
                    // Break inmediato: Solo envía 1 sticker por mensaje para evitar spam/baneo
                    break; 
                } else {
                    console.log(`[AutoSticker] Aviso: Se detectó '${palabra}', pero no existe el archivo ${stickerPath}`);
                }
            }
        }
    }
};
