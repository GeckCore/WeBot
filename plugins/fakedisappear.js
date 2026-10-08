// plugins/fakedisappear.js
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'fakedisappear',
    match: (text) => /^\.(fakedisappear|desaparecer|efimero|tempmsg)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(fakedisappear|desaparecer|efimero|tempmsg)\s*/i, '').trim();

        if (!rawInput) {
            const ayuda = "❌ *Formato incorrecto.*\n\n📌 *Uso directo en grupo:*\n• `.fakedisappear <texto>`\n\n🌐 *Uso remoto desde privado:*\n• `.fakedisappear <num_grupo> | <texto>`\n_O selecciona el grupo previamente con `.grupos` y `.mensajes <número>`._";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textoFinal = rawInput;

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
            // MODO REMOTO (Desde privado)
            const parts = rawInput.split('|').map(p => p.trim());
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                await asegurarListaGrupos();

                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;
                    textoFinal = parts.slice(1).join('|').trim();
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }
            } else if (global.lastViewedGroup) {
                targetJid = global.lastViewedGroup;
                const found = global.cachedGroupList.find(g => g.id === targetJid);
                if (found) groupSubject = found.subject;
                textoFinal = rawInput;
            } else {
                targetJid = remitente;
                textoFinal = rawInput;
            }
        }

        if (!textoFinal) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Escribe el texto que deseas enviar con temporizador efímero."
            }, { quoted: msg });
        }

        try {
            if (isGroup) {
                // Destruir comando para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Inyección nativa en el contenedor ephemeralMessage de WhatsApp
            const rawContent = {
                ephemeralMessage: {
                    message: {
                        extendedTextMessage: {
                            text: textoFinal,
                            contextInfo: {
                                expiration: 86400, // 24 horas
                                ephemeralSettingTimestamp: Math.floor(Date.now() / 1000)
                            }
                        }
                    }
                }
            };

            const waMsg = generateWAMessageFromContent(targetJid, rawContent, {
                userJid: sock.user?.id
            });

            await sock.relayMessage(targetJid, waMsg.message, { messageId: waMsg.key.id });

            if (!isGroup && targetJid !== remitente) {
                await sock.sendMessage(remitente, {
                    text: `⏱️ *Mensaje efímero enviado a:* ${groupSubject}\n\n💬 *Texto:* "${textoFinal}"`
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[fakedisappear] Error enviando mensaje efímero:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al enviar mensaje efímero: ${err.message}`
            }, { quoted: msg });
        }
    }
};
