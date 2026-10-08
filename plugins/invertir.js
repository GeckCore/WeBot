// plugins/invertir.js

module.exports = {
    name: 'invertir',
    match: (text) => /^\.(invertir|reverse|rlo|espejo)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(invertir|reverse|rlo|espejo)\s*/i, '').trim();

        if (!rawInput) {
            const ayuda = "❌ *Formato incorrecto.*\n\n📌 *Uso directo:*\n• `.invertir <texto>`\n_Ejemplo:_ `.invertir Hola a todos mis amigos`\n\n🌐 *Uso remoto a grupo desde privado:*\n• `.invertir <num_grupo> | <texto>`\n_O selecciona el grupo previamente con `.grupos` y `.mensajes <número>`._";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textoOriginal = rawInput;

        const asegurarListaGrupos = async () => {
            if (!global.cachedGroupList.length) {
                try {
                    const participating = await sock.groupFetchAllParticipating();
                    const list = Object.values(participating);
                    global.cachedGroupList = list.map((g, index) => ({
                        index: index + 1,
                        id: g.id,
                        subject: g.subject || 'Sin nombre',
                        participantsCount: g.participants?.length || 0
                    }));
                } catch (e) {}
            }
        };

        if (!isGroup) {
            // MODO REMOTO (Desde chat privado)
            const parts = rawInput.split('|').map(p => p.trim());
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                await asegurarListaGrupos();

                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;
                    textoOriginal = parts.slice(1).join('|').trim();
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }
            } else if (global.lastViewedGroup) {
                targetJid = global.lastViewedGroup;
                const found = global.cachedGroupList.find(g => g.id === targetJid);
                if (found) groupSubject = found.subject;
                textoOriginal = rawInput;
            } else {
                targetJid = remitente;
                textoOriginal = rawInput;
            }
        }

        if (!textoOriginal) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Escribe el texto que deseas invertir."
            }, { quoted: msg });
        }

        try {
            if (isGroup) {
                // Borrar comando para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Inversión directa de caracteres preservando emojis y caracteres complejos
            const textoFinal = Array.from(textoOriginal).reverse().join('');

            await sock.sendMessage(targetJid, {
                text: textoFinal
            });

            if (!isGroup && targetJid !== remitente) {
                await sock.sendMessage(remitente, {
                    text: `🔄 *Texto invertido enviado a:* ${groupSubject}\n\n📝 *Original:* ${textoOriginal}\n🪞 *Invertido:* ${textoFinal}`
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[invertir] Error procesando texto invertido:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al invertir texto: ${err.message}`
            }, { quoted: msg });
        }
    }
};
