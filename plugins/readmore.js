// plugins/readmore.js

module.exports = {
    name: 'readmore',
    match: (text) => /^\.(readmore|leermas|rm|spoiler)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(readmore|leermas|rm|spoiler)\s*/i, '').trim();

        if (!rawInput) {
            const ayuda = "❌ *Formato incorrecto.*\n\n📌 *Uso directo en grupo:*\n• `.readmore <texto visible> | <texto oculto>`\n\n🌐 *Uso remoto desde privado:*\n• Primero usa `.grupos` y `.mensajes <número>`\n• O especifica el grupo: `.readmore <num_grupo> | <visible> | <oculto>`\n\n_Ejemplo:_ `.readmore 1 | Hola a todos | ¡Sorpresa! 🎁`";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let texto1 = '';
        let texto2 = '';

        const parts = rawInput.split('|').map(p => p.trim());

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
                        participantsCount: g.participants?.length || 0
                    }));
                } catch (e) {}
            }
        };

        if (!isGroup) {
            // MODO REMOTO (Desde chat privado hacia un grupo)

            // Caso A: Formato explícito con número de grupo: .readmore 1 | texto1 | texto2
            if (parts.length >= 3 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                await asegurarListaGrupos();

                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa \`.grupos\` para ver la lista numerada.`
                    }, { quoted: msg });
                }

                texto1 = parts[1];
                texto2 = parts.slice(2).join('|').trim();

            } else if (parts.length >= 2) {
                // Caso B: Formato con número pegado: .readmore 1 texto1 | texto2
                const numMatch = parts[0].match(/^(\d+)\s+(.+)$/);
                if (numMatch) {
                    const groupIdx = parseInt(numMatch[1], 10);
                    await asegurarListaGrupos();

                    const found = global.cachedGroupList.find(g => g.index === groupIdx);
                    if (found) {
                        targetJid = found.id;
                        groupSubject = found.subject;
                        global.lastViewedGroup = targetJid;
                        texto1 = numMatch[2].trim();
                        texto2 = parts.slice(1).join('|').trim();
                    }
                }

                // Caso C: Usar el grupo previamente visto con .mensajes <num>
                if (!targetJid) {
                    await asegurarListaGrupos();
                    if (global.lastViewedGroup) {
                        targetJid = global.lastViewedGroup;
                        const found = global.cachedGroupList.find(g => g.id === targetJid);
                        if (found) groupSubject = found.subject;
                        texto1 = parts[0];
                        texto2 = parts.slice(1).join('|').trim();
                    } else if (global.cachedGroupList.length > 0) {
                        // Por defecto el primer grupo disponible
                        targetJid = global.cachedGroupList[0].id;
                        groupSubject = global.cachedGroupList[0].subject;
                        global.lastViewedGroup = targetJid;
                        texto1 = parts[0];
                        texto2 = parts.slice(1).join('|').trim();
                    } else {
                        return sock.sendMessage(remitente, {
                            text: "❌ No hay ningún grupo seleccionado.\n📌 *Uso:* Primero usa `.grupos` y `.mensajes <número>`, o especifica el grupo: `.readmore <número_grupo> | texto1 | texto2`"
                        }, { quoted: msg });
                    }
                }

            } else {
                return sock.sendMessage(remitente, {
                    text: "❌ *Falta el delimitador `|`.*\n📌 *Uso:* `.readmore texto1 | texto2` o `.readmore <num_grupo> | texto1 | texto2`"
                }, { quoted: msg });
            }

        } else {
            // MODO DIRECTO (En el propio grupo)
            if (parts.length < 2) {
                return sock.sendMessage(remitente, {
                    text: "❌ *Falta el delimitador `|`.*\n📌 *Uso:* `.readmore texto visible | texto oculto`"
                }, { quoted: msg });
            }
            texto1 = parts[0];
            texto2 = parts.slice(1).join('|').trim();
        }

        if (!texto1 || !texto2) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Debes incluir tanto el texto visible como el texto oculto.\n_Ejemplo:_ `.readmore Hola | Adiós`"
            }, { quoted: msg });
        }

        // Construir mensaje con 4001 caracteres invisibles LTR
        const readMoreChar = String.fromCharCode(8206).repeat(4001);
        const contenidoFinal = `${texto1}${readMoreChar} ${texto2}`;

        try {
            if (isGroup) {
                // En grupo: borrar comando para sigilo y enviar mensaje al grupo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
                await sock.sendMessage(targetJid, { text: contenidoFinal });
            } else {
                // En privado: enviar mensaje al grupo destino y confirmar por privado
                await sock.sendMessage(targetJid, { text: contenidoFinal });
                await sock.sendMessage(remitente, {
                    text: `✅ *Mensaje con 'Leer más' enviado a:* ${groupSubject}\n\n👁️ *Texto visible:* ${texto1}\n🔒 *Texto oculto:* ${texto2}`
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
