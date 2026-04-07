import fs from 'fs';
import path from 'path';

export default {
    name: 'gettoken',
    // Soporta los alias: .token, .gettoken, .serbottoken
    match: (text) => /^\.(token|gettoken|serbottoken)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        const datas = global;
        const userJid = msg.sender || remitente;
        const userNumber = userJid.split('@')[0];
        
        // 1. Gestión de Idioma y Traducción
        const userDb = datas.db.data.users[userJid] || {};
        const idioma = userDb.language || global.defaultLenguaje || 'es';
        
        let tradutor;
        try {
            const pathLang = path.join(process.cwd(), 'src', 'languages', `${idioma}.json`);
            const _translate = JSON.parse(fs.readFileSync(pathLang, 'utf8'));
            tradutor = _translate.plugins.mipilot_serbotcode;
        } catch (e) {
            // Fallback en caso de que no existan los archivos de idioma
            tradutor = {
                texto1: 'Aquí está tu token de sesión, no lo compartas con nadie:',
                texto2: ['Usa el comando', 'para convertirte en sub-bot primero.']
            };
        }

        // 2. Ruta de las credenciales del sub-bot
        const credsExternalPath = path.join(process.cwd(), 'jadibts', userNumber, 'creds.json');

        if (fs.existsSync(credsExternalPath)) {
            try {
                const credsBuffer = fs.readFileSync(credsExternalPath);
                const tokenBase64 = Buffer.from(credsBuffer).toString('base64');

                // Enviar mensaje informativo
                await sock.sendMessage(remitente, { text: tradutor.texto1 }, { quoted: msg });
                
                // Enviar el token (Base64)
                await sock.sendMessage(remitente, { text: tokenBase64 }, { quoted: msg });
                
            } catch (err) {
                console.error('Error al leer el token:', err);
                await sock.sendMessage(remitente, { text: '❌ Error al procesar el token de sesión.' }, { quoted: msg });
            }
        } else {
            // Mensaje si no es sub-bot o no hay sesión guardada
            const prefix = '.'; // Prefijo por defecto
            const response = `${tradutor.texto2[0]} ${prefix}jadibot ${tradutor.texto2[1]}`;
            await sock.sendMessage(remitente, { text: response }, { quoted: msg });
        }
    }
};
