// plugins/fakewa.js

module.exports = {
    name: 'fakewa',
    match: (text) => /^\.(fakewa|qwa|fakeverificado|whatsappquote)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(fakewa|qwa|fakeverificado|whatsappquote)\s*/i, '').trim();

        if (!rawInput) {
            const ayuda = "❌ *Formato incorrecto.*\n\n📌 *Uso directo:*\n• `.fakewa <texto de WhatsApp> | [tu respuesta]`\n_Ejemplo:_ `.fakewa Tu cuenta ha sido verificada con éxito. | Muchas gracias 🙏`\n\n🌐 *Uso remoto a grupo desde privado:*\n• `.fakewa <num_grupo> | <texto de WhatsApp> | [tu respuesta]`\n_O selecciona el grupo previamente con `.grupos` y `.mensajes <número>`._";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textoFalso = '';
        let reaccion = '¿Cómo?';

        const parts = rawInput.split('|').map(p => p.trim());

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
            // MODO PRIVADO
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                // Caso A: Selección explícita por número: .fakewa 1 | texto | respuesta
                const groupIdx = parseInt(parts[0], 10);
                await asegurarListaGrupos();

                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }

                textoFalso = parts[1];
                if (parts[2]) reaccion = parts.slice(2).join('|').trim();

            } else if (global.lastViewedGroup) {
                // Caso B: Grupo seleccionado previamente con .mensajes <num>
                targetJid = global.lastViewedGroup;
                const found = global.cachedGroupList.find(g => g.id === targetJid);
                if (found) groupSubject = found.subject;
                textoFalso = parts[0];
                if (parts[1]) reaccion = parts.slice(1).join('|').trim();
            } else {
                // Caso C: Enviar en el propio chat privado
                targetJid = remitente;
                textoFalso = parts[0];
                if (parts[1]) reaccion = parts.slice(1).join('|').trim();
            }
        } else {
            // MODO GRUPO DIRECTO
            textoFalso = parts[0];
            if (parts[1]) reaccion = parts.slice(1).join('|').trim();
        }

        if (!textoFalso) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Escribe el texto que quieres atribuir a WhatsApp.\n_Ejemplo:_ `.fakewa Aviso oficial | Entendido`"
            }, { quoted: msg });
        }

        try {
            if (isGroup) {
                // Borrar comando para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Construcción del exploit en memoria con JID oficial de WhatsApp (0@s.whatsapp.net)
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: '0@s.whatsapp.net',
                    remoteJid: targetJid,
                    id: '3EB0' + Date.now().toString(16).toUpperCase()
                },
                message: {
                    conversation: textoFalso
                }
            };

            // Envío de la respuesta citando a WhatsApp
            await sock.sendMessage(targetJid, {
                text: reaccion
            }, {
                quoted: mensajeInyectado
            });

            if (!isGroup && targetJid !== remitente) {
                await sock.sendMessage(remitente, {
                    text: `✅ *Fakequote de WhatsApp enviado a:* ${groupSubject}\n\n💬 *WhatsApp:* "${textoFalso}"\n↩️ *Respuesta:* "${reaccion}"`
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[fakewa] Error inyectando cita de WhatsApp:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al inyectar cita de WhatsApp: ${err.message}`
            }, { quoted: msg });
        }
    }
};
