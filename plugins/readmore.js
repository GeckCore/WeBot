// plugins/readmore.js

module.exports = {
    name: 'readmore',
    match: (text) => /^\.(readmore|leermas|rm|spoiler)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(readmore|leermas|rm|spoiler)\s*/i, '');

        if (!rawInput.trim()) {
            const ayuda = "❌ *Formato incorrecto.*\n\n"
                + "📌 *Uso directo en grupo (múltiples cortes):*\n"
                + "• `.readmore <visible> | <oculto 1> | <oculto 2> ...`\n"
                + "_Ejemplo:_ `.readmore hola como es|tas?, yo estoy| bien, queria saber si...`\n\n"
                + "🌐 *Uso remoto desde privado:*\n"
                + "1. Selecciona el grupo con `.grupos` y `.mensajes <número>`.\n"
                + "2. `.readmore <visible> | <oculto 1> | <oculto 2> ...`\n"
                + "• O explícito: `.readmore <num_grupo> | <visible> | <oculto 1> | ...`";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textSegments = [];

        // Función para auto-cargar grupos si la memoria está vacía
        const asegurarListaGrupos = async () => {
            if (!global.cachedGroupList.length) {
                try {
                    const participating = await sock.groupFetchAllParticipating();
                    const list = Object.values(participating);
                    global.cachedGroupList = list.map((g, index) => ({
                        index: index + 1,
                        id: g.id,
                        subject: g.subject || 'Sin nombre',
                        participantsCount: g.participants?.length || 0,
                        participants: Array.isArray(g.participants) ? g.participants : []
                    }));
                } catch (e) {}
            }
        };

        const firstSep = rawInput.indexOf('|');
        if (firstSep === -1) {
            return sock.sendMessage(remitente, {
                text: "❌ *Falta el delimitador `|`.*\n📌 *Uso:* `.readmore parte1 | parte2 | parte3...`\n_Ejemplo:_ `.readmore hola como es|tas?, yo estoy| bien, queria saber si...`"
            }, { quoted: msg });
        }

        if (!isGroup) {
            // MODO REMOTO (Desde chat privado hacia un grupo)
            await asegurarListaGrupos();

            const firstPart = rawInput.slice(0, firstSep).trim();
            const groupIdx = parseInt(firstPart, 10);

            // Caso A: El primer segmento es un número que corresponde a un grupo en caché
            if (!isNaN(groupIdx) && global.cachedGroupList?.length) {
                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;

                    const remainder = rawInput.slice(firstSep + 1).replace(/^\s+/, '');
                    textSegments = remainder.split('|');
                }
            }

            // Caso B: No especificó grupo explícito, usar grupo activo o primer grupo
            if (!targetJid) {
                if (global.lastViewedGroup) {
                    targetJid = global.lastViewedGroup;
                    const found = global.cachedGroupList.find(g => g.id === targetJid);
                    if (found) groupSubject = found.subject;
                } else if (global.cachedGroupList?.length > 0) {
                    targetJid = global.cachedGroupList[0].id;
                    groupSubject = global.cachedGroupList[0].subject;
                    global.lastViewedGroup = targetJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: "❌ No hay ningún grupo seleccionado.\n📌 *Uso:* Primero usa `.grupos` y `.mensajes <número>`, o especifica: `.readmore <número_grupo> | parte1 | parte2...`"
                    }, { quoted: msg });
                }

                textSegments = rawInput.split('|');
            }
        } else {
            // MODO DIRECTO EN GRUPO
            textSegments = rawInput.split('|');
        }

        if (textSegments.length < 2) {
            return sock.sendMessage(remitente, {
                text: "❌ Debes incluir al menos dos partes separadas por `|`.\n_Ejemplo:_ `.readmore visible | oculto`"
            }, { quoted: msg });
        }

        // Construir mensaje uniendo cada corte con 4001 caracteres invisibles LTR
        const readMoreChar = String.fromCharCode(8206).repeat(4001);
        const contenidoFinal = textSegments.join(readMoreChar);

        try {
            if (isGroup) {
                // En grupo: borrar comando para sigilo y enviar mensaje al grupo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
                await sock.sendMessage(targetJid, { text: contenidoFinal });
            } else {
                // En privado: enviar mensaje al grupo destino y confirmar por privado
                await sock.sendMessage(targetJid, { text: contenidoFinal });
                await sock.sendMessage(remitente, {
                    text: `✅ *Mensaje con ${textSegments.length - 1} 'Leer más' enviado a:* ${groupSubject}\n\n👁️ *Texto visible inicial:* ${textSegments[0].trim()}\n🔒 *Cortes 'Leer más':* ${textSegments.length - 1}`
                }, { quoted: msg });
            }
        } catch (err) {
            console.error('[readmore] Error enviando mensaje al grupo:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al enviar el mensaje al grupo: ${err.message}`
            }, { quoted: msg });
        }
    }
};
