export default {
    name: 'intelligence_protocols',
    
    match: (text, ctx) => {
        // Intercepta si el modo Hijack está activo para la víctima
        if (global.hijackTargets && global.hijackTargets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        // O si tú envías el comando
        return /^\.(leak|hijack)/i.test(text) && ctx.msg.key.fromMe;
    },
    
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        
        // --- COMANDO .leak ---
        if (/^\.leak/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            global.leakActive[remitente] = !global.leakActive[remitente];
            console.log(`[LEAK] ${global.leakActive[remitente] ? 'ON' : 'OFF'} para ${remitente}`);
            return;
        }

        // --- COMANDO .hijack ---
        if (/^\.hijack/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            global.hijackTargets[remitente] = !global.hijackTargets[remitente];
            console.log(`[HIJACK] ${global.hijackTargets[remitente] ? 'ON' : 'OFF'} para ${remitente}`);
            return;
        }

        // --- ACCIÓN AUTOMÁTICA HIJACK ---
        if (global.hijackTargets[remitente] && !msg.key.fromMe && textoLimpio) {
            const insultos = [
                "Acabo de decir que soy un payaso.",
                "La verdad es que no tengo ni idea de lo que hablo.",
                "A veces me gusta lamer las paredes.",
                "Confirmado: me falta un hervor.",
                "Efectivamente, soy el más tonto de mi casa."
            ];
            const fraseFalsa = insultos[Math.floor(Math.random() * insultos.length)];

            // Construcción de la cita falsa automática
            const fakeQuote = {
                key: {
                    remoteJid: remitente,
                    fromMe: false,
                    id: 'HIJACK' + Math.random().toString(36).substring(2, 10).toUpperCase(),
                    participant: remitente
                },
                message: { conversation: fraseFalsa }
            };

            await sock.sendMessage(remitente, { text: "Menuda confesión..." }, { quoted: fakeQuote });
        }
    }
};
