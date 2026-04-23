export default {
    name: 'esteganografia_texto',
    match: (text) => /^\.(hide|read)/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        
        const comando = textoLimpio.split(' ')[0].toLowerCase();
        
        // El núcleo del exploit: Caracteres Unicode que el motor de renderizado ignora visualmente
        const ZW0 = '\u200B'; // Representa el bit 0
        const ZW1 = '\u200C'; // Representa el bit 1
        const ZWSep = '\u200D'; // Separador de bloques de bits

        try {
            if (comando === '.hide') {
                const input = textoLimpio.replace(/^\.hide\s*/i, '').trim();
                if (!input.includes('|')) return sock.sendMessage(remitente, { text: "❌ Formato: .hide Secreto | Texto de cobertura" });

                const [secreto, visible] = input.split('|').map(p => p.trim());
                
                // 1. Motor de codificación: Texto -> Binario -> Unicode Invisible
                let oculto = '';
                for (let i = 0; i < secreto.length; i++) {
                    const binario = secreto[i].charCodeAt(0).toString(2);
                    for (let bit of binario) oculto += (bit === '0' ? ZW0 : ZW1);
                    oculto += ZWSep;
                }

                // Sigilo: Borramos el comando
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch(e){}

                // 2. Inyección limpia: El texto normal lleva pegado el código invisible al final
                await sock.sendMessage(remitente, { text: visible + oculto });
            } 
            else if (comando === '.read') {
                
                if (!quoted) return sock.sendMessage(remitente, { text: "❌ Responde al mensaje interceptado." }, { quoted: msg });

                const textoAnalizar = quoted.message.conversation || quoted.message.extendedTextMessage?.text || '';
                
                // 3. Motor de extracción: Analiza la cadena invisible y reconstruye el binario
                let secretoRevelado = '';
                let binarioActual = '';
                
                for (let char of textoAnalizar) {
                    if (char === ZW0) binarioActual += '0';
                    else if (char === ZW1) binarioActual += '1';
                    else if (char === ZWSep) {
                        if (binarioActual) secretoRevelado += String.fromCharCode(parseInt(binarioActual, 2));
                        binarioActual = '';
                    }
                }

                if (!secretoRevelado) return sock.sendMessage(remitente, { text: "⚠️ Negativo. No hay carga encriptada en este texto." }, { quoted: msg });

                // 4. Salida en consola y en chat
                await sock.sendMessage(remitente, { text: `👁️ *DATOS EXTRAÍDOS:*\n\n${secretoRevelado}` }, { quoted: msg });
            }
        } catch (err) {
            console.error("Error en módulo criptográfico:", err);
        }
    }
};
