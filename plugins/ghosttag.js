// plugins/ghosttag.js

module.exports = {
    name: 'ghosttag',
    match: (text) => /^\.(ghosttag|gtag|fantasma|ghost)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(ghosttag|gtag|fantasma|ghost)\s*/i, '').trim();

        if (!rawInput && !quoted) {
            const ayuda = "❌ *Formato incorrecto.*\n\n"
                + "📌 *Uso directo en grupo:*\n"
                + "• `.ghosttag @usuario <mensaje>` (Tag fantasma solo a esa persona)\n"
                + "• `.ghosttag <mensaje>` (Ghost Tagall silencioso a todos los miembros)\n\n"
                + "🌐 *Uso remoto desde chat privado:*\n"
                + "1. Usa `.grupos` y luego `.mensajes <número>` para ver el grupo y sus personas numeradas.\n"
                + "2. `.ghosttag <num_persona> | <mensaje>` (Tag fantasma a esa persona)\n"
                + "3. `.ghosttag <mensaje>` (Ghost Tagall a todo el grupo seleccionado)\n"
                + "• O directo: `.ghosttag <num_grupo> | <num_persona|all> | <mensaje>`";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetGroupJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textoFinal = '';
        let targetParticipant = null;
        let targetPushName = '';
        let isTagAll = false;

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

        // ==========================================
        // MODO 1: EJECUCIÓN DIRECTA EN GRUPO
        // ==========================================
        if (isGroup) {
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            const mentionedJids = contextInfo?.mentionedJid || [];
            const quotedParticipant = contextInfo?.participant;

            if (mentionedJids.length > 0) {
                // Etiqueta a la persona mencionada
                targetParticipant = mentionedJids[0];
                textoFinal = rawInput.replace(/@\d+/g, '').trim();
            } else if (quotedParticipant) {
                // Etiqueta al autor del mensaje citado
                targetParticipant = quotedParticipant;
                textoFinal = rawInput.trim();
            } else {
                // Si no hay mención ni cita, es GHOST TAGALL a todo el grupo
                isTagAll = true;
                textoFinal = rawInput.trim();
            }
        } 
        // ==========================================
        // MODO 2: EJECUCIÓN REMOTA DESDE PRIVADO
        // ==========================================
        else {
            await asegurarListaGrupos();
            const parts = rawInput.split('|').map(p => p.trim());

            // Caso A: Formato explícito de 3 partes: .ghosttag <num_grupo> | <num_persona o all> | <mensaje>
            if (parts.length >= 3 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetGroupJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetGroupJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }

                const personaSelector = parts[1].toLowerCase();
                textoFinal = parts.slice(2).join('|').trim();

                if (personaSelector === 'all' || personaSelector === 'todos') {
                    isTagAll = true;
                } else {
                    const pIdx = parseInt(personaSelector, 10);
                    if (!isNaN(pIdx)) {
                        // Buscar en el snapshot congelado de .mensajes
                        const snap = global.lastDisplayedSnapshot;
                        if (snap && snap.groupJid === targetGroupJid && snap.messages[pIdx - 1]) {
                            targetParticipant = snap.messages[pIdx - 1].participant;
                            targetPushName = snap.messages[pIdx - 1].pushName || '';
                        } else {
                            // Fallback al buffer en tiempo real
                            const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                            if (buf[pIdx - 1]) {
                                targetParticipant = buf[pIdx - 1].participant;
                                targetPushName = buf[pIdx - 1].pushName || '';
                            }
                        }
                    }
                }
            }
            // Caso B: Con grupo ya seleccionado vía .mensajes <número> o .grupos
            else {
                if (global.lastViewedGroup) {
                    targetGroupJid = global.lastViewedGroup;
                    const found = global.cachedGroupList.find(g => g.id === targetGroupJid);
                    if (found) groupSubject = found.subject;
                } else if (global.cachedGroupList?.length > 0) {
                    targetGroupJid = global.cachedGroupList[0].id;
                    groupSubject = global.cachedGroupList[0].subject;
                    global.lastViewedGroup = targetGroupJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: "❌ No hay ningún grupo seleccionado.\n📌 *Uso:* Primero usa `.grupos` y `.mensajes <número>`."
                    }, { quoted: msg });
                }

                // Subcaso B1: Selecciona persona con barra: .ghosttag <num_persona> | <mensaje>
                if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                    const pIdx = parseInt(parts[0], 10);
                    textoFinal = parts.slice(1).join('|').trim();

                    const snap = global.lastDisplayedSnapshot;
                    if (snap && snap.groupJid === targetGroupJid && snap.messages[pIdx - 1]) {
                        targetParticipant = snap.messages[pIdx - 1].participant;
                        targetPushName = snap.messages[pIdx - 1].pushName || '';
                    } else {
                        const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                        if (buf[pIdx - 1]) {
                            targetParticipant = buf[pIdx - 1].participant;
                            targetPushName = buf[pIdx - 1].pushName || '';
                        }
                    }
                } 
                // Subcaso B2: Formato .ghosttag all | <mensaje>
                else if (parts.length >= 2 && (parts[0].toLowerCase() === 'all' || parts[0].toLowerCase() === 'todos')) {
                    isTagAll = true;
                    textoFinal = parts.slice(1).join('|').trim();
                } 
                // Subcaso B3: Solo mensaje (.ghosttag <mensaje>) -> Tagall por defecto al grupo seleccionado
                else {
                    isTagAll = true;
                    textoFinal = rawInput.trim();
                }
            }
        }

        if (!textoFinal) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Escribe el mensaje que deseas enviar con mención fantasma."
            }, { quoted: msg });
        }

        try {
            // Resolver lista de menciones
            let finalMentions = [];

            if (isTagAll || !targetParticipant) {
                // Ghost Tagall: obtener todos los participantes del grupo
                try {
                    const metadata = await sock.groupMetadata(targetGroupJid);
                    if (metadata) {
                        groupSubject = metadata.subject || groupSubject;
                        if (Array.isArray(metadata.participants)) {
                            finalMentions = metadata.participants
                                .map(p => p.id)
                                .filter(id => id && id.endsWith('@s.whatsapp.net'));
                        }
                    }
                } catch (e) {
                    console.error('[ghosttag] Error obteniendo participantes del grupo:', e);
                }
                isTagAll = true;
            } else {
                // Ghost tag individual
                let cleanJid = targetParticipant;
                // Si es un LID, intentar resolver a número de teléfono
                if (cleanJid.endsWith('@lid')) {
                    try {
                        const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
                        const match = metadata?.participants?.find(p => p.lid === cleanJid || p.id === cleanJid);
                        if (match?.phoneNumber) cleanJid = match.phoneNumber;
                        else if (match?.id?.endsWith('@s.whatsapp.net')) cleanJid = match.id;
                    } catch (e) {}
                }
                finalMentions = [cleanJid];
            }

            if (isGroup) {
                // En grupo: borrar comando para sigilo absoluto
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Enviar mensaje con el array interno de mentions pero SIN ninguna arroba visible en el texto
            await sock.sendMessage(targetGroupJid, {
                text: textoFinal,
                mentions: finalMentions
            });

            // Si se envió desde privado, confirmar al operador
            if (!isGroup) {
                const modoTxt = isTagAll 
                    ? `📢 *Ghost Tagall* (${finalMentions.length} miembros)`
                    : `🎯 *Ghost Tag Individual* (+${targetParticipant.split('@')[0]}${targetPushName ? ' - ' + targetPushName : ''})`;

                await sock.sendMessage(remitente, {
                    text: `👻 *[GHOST TAG EJECUTADO]*\n\n`
                        + `👥 *Grupo:* ${groupSubject}\n`
                        + `⚡ *Modo:* ${modoTxt}\n`
                        + `💬 *Mensaje:* "${textoFinal}"`
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[ghosttag] Error ejecutando ghost tag:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al ejecutar ghost tag: ${err.message}`
            }, { quoted: msg });
        }
    }
};
