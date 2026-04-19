import fs from 'fs';
import path from 'path';

// ==========================================
// DICCIONARIO ESTRATÉGICO DE SHITPOST
// Mapeo de palabras clave, frases y variantes al sticker correspondiente.
// ==========================================
const dictionary = {
    // ♀️ Mujeres / Femenino
    'mujeres': 'mujeres.webp', 'mujere': 'mujeres.webp', 'mujer': 'mujeres.webp',
    'women': 'mujeres.webp', 'womens': 'mujeres.webp', 'womans': 'mujeres.webp',
    
    // 💩 Desprecio / Quejas
    'mierda': 'mierda.webp', 'caca': 'mierda.webp', 'basura': 'mierda.webp', 'bodrio': 'mierda.webp',
    
    // 🇪🇸 Política / Edgy
    'psoe': 'psoe.webp', 'pedro sanchez': 'psoe.webp', 'perro sanxe': 'psoe.webp', 'zurdos': 'psoe.webp',
    'nazi': 'nazi.webp', 'adolf': 'nazi.webp', 'judios': 'nazi.webp', 'gasear': 'nazi.webp',
    
    // 😂 Risas
    'jaja': 'jajaja.webp', 'jajaja': 'jajaja.webp', 'jsjs': 'jajaja.webp', 'jsjsjs': 'jajaja.webp',
    'xd': 'jajaja.webp', 'xdd': 'jajaja.webp', 'xddd': 'jajaja.webp', 'lol': 'jajaja.webp',
    
    // 😭 Tristeza / Lloros
    'pipipi': 'pipipi.webp', 'lloro': 'pipipi.webp', 'sad': 'pipipi.webp', 'depre': 'pipipi.webp',
    'noo': 'noo.webp', 'nooo': 'noo.webp', 'f': 'noo.webp', 'rip': 'noo.webp',
    
    // 👍 Aprobación / Confirmación
    'ok': 'okey.webp', 'vale': 'okey.webp', 'okey': 'okey.webp', 'va': 'okey.webp', 'oka': 'okey.webp',
    'mmm': 'ujumm.webp', 'ujumm': 'ujumm.webp', 'aham': 'ujumm.webp',
    ':3': '3.webp', 'uwu': '3.webp', 'owo': '3.webp',
    
    // 😨 Miedo
    'miedo': 'miedo.webp', 'susto': 'miedo.webp', 'terror': 'miedo.webp', 'cagado': 'miedo.webp',
    
    // 🚶 Movimiento / Acción
    'voy': 'voy.webp', 'yendo': 'voy.webp', 'omw': 'voy.webp',
    'vamos': 'goo.webp', 'gg': 'goo.webp', 'go': 'goo.webp', 'dale': 'goo.webp',
    
    // 🎭 Roles / Cultura
    'chino': 'chino.webp', 'chinita': 'chino.webp', 'asia': 'chino.webp',
    'poeta': 'poeta.webp', 'poema': 'poeta.webp', 'cine': 'poeta.webp', 'arte': 'poeta.webp',
    
    // 🗿 Basado / Sudapollismo
    'me la pela': 'melapela.webp', 'me suda': 'melapela.webp', 'me chupa': 'melapela.webp', 'me resbala': 'melapela.webp',
    '-1000 aura': 'aura.webp', 'menos aura': 'aura.webp', 'pierde aura': 'aura.webp',
    'basado': 'basado.webp', 'factos': 'basado.webp', 'facts': 'basado.webp', 'padre': 'basado.webp',
    
    // 🧐 Duda / Sospecha / Fuentes
    'fuentes': 'fuentes.webp', 'link': 'fuentes.webp', 'salsa': 'fuentes.webp',
    'sospechoso': 'desconfianza.webp', 'raro': 'desconfianza.webp', 'turbio': 'desconfianza.webp', 'sus': 'desconfianza.webp',
    'piensa': 'think.webp', 'que': 'think.webp', 'enserio': 'think.webp', 'iq': 'think.webp',
    
    // 👀 Observación / Freno
    'jura': 'lookhe.webp', 'look': 'lookhe.webp', 'mira': 'lookhe.webp', 'observa': 'lookhe.webp',
    'bruh': 'stop.webp', 'para': 'stop.webp', 'basta': 'stop.webp', 'stop': 'stop.webp', 'frena': 'stop.webp',
    
    // 🤤 Placer / Gusto
    'rico': 'rico.webp', 'riko': 'rico.webp', 'sabroso': 'rico.webp', 'gloria': 'rico.webp',
    'love': 'love.webp', 'guapa': 'love.webp', 'amor': 'love.webp', 'preciosa': 'love.webp',
    
    // 🤫 Silencio / Calma
    'calla': 'silence.webp', 'silencio': 'silence.webp', 'shh': 'silence.webp', 'callate': 'silence.webp',
    'shutup': 'shutup.webp', 'cierra el pico': 'shutup.webp',
    'paz': 'peace.webp', 'tranquilidad': 'peace.webp', 'chill': 'peace.webp', 'relax': 'peace.webp',
    
    // 🕺 Fiesta / Movimiento
    'baila': 'dance.webp', 'fiesta': 'dance.webp', 'discoteca': 'dance.webp', 'party': 'dance.webp',
    
    // 💼 Trabajo / Obligaciones / Gym
    'trabajo': 'job.webp', 'trabajar': 'job.webp', 'beca': 'job.webp', 'bequita': 'job.webp', 'curro': 'job.webp', 'pala': 'job.webp', 'agarrar la pala': 'job.webp',
    'reza': 'jobapp.webp', 'recemos': 'jobapp.webp', 'dios': 'jobapp.webp', 'amen': 'jobapp.webp',
    'gym': 'gym.webp', 'gimnasio': 'gym.webp', 'entrenar': 'gym.webp', 'pesas': 'gym.webp', 'mamado': 'gym.webp'
};

const triggers = Object.keys(dictionary);

// Función para escapar caracteres especiales de Regex en las frases (ej: :3 o -1000)
const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default {
    name: 'auto_stickers',
    
    match: (text) => {
        if (/^\.(autosticker|as)\s+(on|off)$/i.test(text)) return true;
        
        const lower = text.toLowerCase();
        // Usa un motor de detección adaptado para detectar frases compuestas y símbolos sin romper la validación
        return triggers.some(word => {
            const regex = new RegExp(`(^|\\s|[.,?!])${escapeRegex(word)}([.,?!\\s]|$)`, 'i');
            return regex.test(lower);
        });
    },

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        if (!global.db.data.chats[remitente]) {
            global.db.data.chats[remitente] = { autosticker: false };
        }
        
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

        const mediaDir = path.join(process.cwd(), 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);

        const lowerText = textoLimpio.toLowerCase();

        // Ordenamos los triggers por longitud (los más largos primero) para evitar 
        // que "ok" se detecte antes que "okey" si ambos estuvieran en conflicto.
        const sortedTriggers = [...triggers].sort((a, b) => b.length - a.length);

        for (const palabra of sortedTriggers) {
            const regex = new RegExp(`(^|\\s|[.,?!])${escapeRegex(palabra)}([.,?!\\s]|$)`, 'i');
            
            if (regex.test(lowerText)) {
                const stickerPath = path.join(mediaDir, dictionary[palabra]);

                if (fs.existsSync(stickerPath)) {
                    await sock.sendMessage(remitente, { 
                        sticker: { url: stickerPath } 
                    }, { quoted: msg });
                    
                    // Break inmediato: Solo envía 1 sticker por mensaje
                    break; 
                } else {
                    console.log(`[AutoSticker] Aviso: Se detectó '${palabra}', pero no existe el archivo ${stickerPath}`);
                }
            }
        }
    }
};
