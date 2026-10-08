// plugins/titiritero2.js
const delay = (ms) => new Promise(res => setTimeout(res, ms));

module.exports = {
    name: 'titiritero2',
    match: (text) => /^\.(titiritero2|titi2)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const rawArgs = (textoLimpio || '').replace(/^\.(titiritero2|titi2)\s*/i, '').trim();

        let targetGroupJid = remitente.endsWith('@g.us') ? remitente : global.lastViewedGroup;
        let groupName = 'el grupo';
        let targetStanzaId = null;
        let targetParticipant = '';
        let targetText = '';
        let nuevoTexto = '';
        let pingTexto = '📢 ¡Atención a todos!'; // Aviso visible por defecto
        let isDirectInGroup = false;
        let targetPushName = '';

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        // ==========================================
        // CASO A: Usado directamente en un grupo citando el mensaje
        // ==========================================
        if (contextInfo?.stanzaId && remitente.endsWith('@g.us')) {
            targetGroupJid = remitente;
            targetStanzaId = contextInfo.stanzaId;
            targetParticipant = contextInfo.participant || '';
            isDirectInGroup = true;

            const partsDirect = rawArgs.split('|').map(p => p.trim());
            nuevoTexto = partsDirect[0] || '';
            if (partsDirect[1]) pingTexto = partsDirect.slice(1).join('|').trim();
        }

        // ==========================================
        // CASO B: Parsear argumentos con separador '|'
        // ==========================================
        if (!targetStanzaId) {
            if (!rawArgs) {
                const ayuda = "❌ *Formato incorrecto.*\n\n"
                    + "📌 *Uso directo en grupo (citando mensaje):*\n"
                    + "• `.titiritero2 <nuevo texto> | [aviso TagAll]`\n\n"
                    + "🌐 *Uso remoto desde privado:*\n"
                    + "1. Elige el grupo con `.grupos` y luego `.mensajes <número>`.\n"
                    + "2. `.titiritero2 <#PIN o número> | <nuevo texto> | [aviso TagAll]`\n"
                    + "• O explícito: `.titiritero2 <num_grupo> | <#PIN o número> | <nuevo texto> | [aviso]`\n\n"
                    + "📢 *Efecto:* Modifica el mensaje de la víctima y envía un aviso visible con **TagAll real** citando el mensaje alterado.";
                return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
            }

            const parts = rawArgs.split('|').map(p => p.trim());

            // Subcaso B1: 4 partes (.titiritero2 <num_grupo> | <#PIN o num> | <nuevo_texto> | <aviso>)
            if (parts.length >= 4 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                if (global.cachedGroupList?.length) {
                    const found = global.cachedGroupList.find(g => g.index === groupIdx);
                    if (found) {
                        targetGroupJid = found.id;
                        groupName = found.subject;
                        global.lastViewedGroup = targetGroupJid;
                    }
                }
                const targetSelector = parts[1];
                nuevoTexto = parts[2];
                if (parts[3]) pingTexto = parts.slice(3).join('|').trim();
                resolverObjetivo(targetSelector, targetGroupJid);
            }
            // Subcaso B2: 3 partes con grupo explícito (.titiritero2 <num_grupo> | <#PIN o num> | <nuevo_texto>)
            else if (parts.length >= 3 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                if (global.cachedGroupList?.length) {
                    const found = global.cachedGroupList.find(g => g.index === groupIdx);
                    if (found) {
                        targetGroupJid = found.id;
                        groupName = found.subject;
                        global.lastViewedGroup = targetGroupJid;
                    }
                }
                const targetSelector = parts[1];
                nuevoTexto = parts.slice(2).join('|').trim();
                resolverObjetivo(targetSelector, targetGroupJid);
            }
            // Subcaso B3: 3 partes con grupo ya seleccionado (.titiritero2 <#PIN o num> | <nuevo_texto> | <aviso>)
            else if (parts.length >= 3) {
                const targetSelector = parts[0];
                nuevoTexto = parts[1];
                pingTexto = parts.slice(2).join('|').trim();

                if (!targetGroupJid && global.cachedGroupList?.length > 0) {
                    targetGroupJid = global.cachedGroupList[0].id;
                }
                resolverObjetivo(targetSelector, targetGroupJid);
            }
            // Subcaso B4: 2 partes (.titiritero2 <#PIN o num> | <nuevo_texto>)
            else if (parts.length >= 2) {
                const targetSelector = parts[0];
                nuevoTexto = parts.slice(1).join('|').trim();

                if (!targetGroupJid && global.cachedGroupList?.length > 0) {
                    targetGroupJid = global.cachedGroupList[0].id;
                }

                resolverObjetivo(targetSelector, targetGroupJid);
            } else {
                return sock.sendMessage(remitente, {
                    text: "❌ Debes incluir el selector y el nuevo texto separados por `|`.\n_Ejemplo:_ `.titiritero2 #18B4 | Hola a todos`"
                }, { quoted: msg });
            }
        }

        function resolverObjetivo(targetSelector, groupJid) {
            const cleanSel = targetSelector.replace(/^#/, '').toUpperCase();
            const mIdx = parseInt(targetSelector, 10) - 1;

            let targetItem = null;

            // 1. Prioridad: Snapshot congelado de .mensajes
            if (global.lastDisplayedSnapshot && global.lastDisplayedSnapshot.groupJid === groupJid) {
                if (!isNaN(mIdx) && mIdx >= 0 && global.lastDisplayedSnapshot.messages[mIdx]) {
                    targetItem = global.lastDisplayedSnapshot.messages[mIdx];
                } else {
                    targetItem = global.lastDisplayedSnapshot.messages.find(m => 
                        (m.shortId && m.shortId.toUpperCase() === cleanSel) ||
                        (m.pushName && m.pushName.toLowerCase().includes(targetSelector.toLowerCase())) ||
                        (m.id && m.id === targetSelector)
                    );
                }
            }

            // 2. Fallback: Buffer en tiempo real
            if (!targetItem && groupJid) {
                const buf = global.recentGroupMessages.get(groupJid) || [];
                if (!isNaN(mIdx) && mIdx >= 0 && buf[mIdx]) {
                    targetItem = buf[mIdx];
                } else {
                    targetItem = buf.find(m => 
                        (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                        (m.id && m.id === targetSelector) ||
                        (m.pushName && m.pushName.toLowerCase().includes(targetSelector.toLowerCase()))
                    );
                }
            }

            if (targetItem) {
                targetStanzaId = targetItem.id;
                targetParticipant = targetItem.participant;
                targetText = targetItem.text;
                targetPushName = targetItem.pushName || '';
            } else if (targetSelector.length > 10) {
                targetStanzaId = targetSelector;
            }
        }

        if (!targetGroupJid) {
            return sock.sendMessage(remitente, {
                text: "❌ No hay ningún grupo objetivo seleccionado.\nUsa primero `.grupos` y luego `.mensajes <número>`."
            }, { quoted: msg });
        }

        if (!targetStanzaId) {
            return sock.sendMessage(remitente, {
                text: "❌ No se pudo localizar el mensaje objetivo en memoria.\nVerifica el `#PIN` o número con `.mensajes`."
            }, { quoted: msg });
        }

        if (!nuevoTexto) {
            return sock.sendMessage(remitente, {
                text: "❌ Introduce el nuevo texto para el mensaje."
            }, { quoted: msg });
        }

        // ==========================================
        // OBTENCIÓN ROBUSTA DE PARTICIPANTES PARA TAGALL
        // ==========================================
        let allParticipants = [];
        let finalParticipant = targetParticipant;
        let participantPn = '';

        let rawParticipantsList = [];
        let groupMetaObj = null;

        // Intentar 1: metadata fresca de WhatsApp
        try {
            groupMetaObj = await sock.groupMetadata(targetGroupJid).catch(() => null);
            if (groupMetaObj) {
                if (groupMetaObj.subject) groupName = groupMetaObj.subject;
                if (Array.isArray(groupMetaObj.participants) && groupMetaObj.participants.length > 0) {
                    rawParticipantsList = groupMetaObj.participants;
                }
            }
        } catch (e) {}

        // Fallback 2: Buscar en lista en caché de .grupos
        if ((!rawParticipantsList || !rawParticipantsList.length) && global.cachedGroupList?.length) {
            const foundCached = global.cachedGroupList.find(g => g.id === targetGroupJid);
            if (foundCached) {
                if (foundCached.subject) groupName = foundCached.subject;
                if (Array.isArray(foundCached.participants) && foundCached.participants.length > 0) {
                    rawParticipantsList = foundCached.participants;
                }
            }
        }

        // Fallback 3: Consultar sock.groupFetchAllParticipating()
        if (!rawParticipantsList || !rawParticipantsList.length) {
            try {
                const participating = await sock.groupFetchAllParticipating();
                if (participating?.[targetGroupJid]) {
                    const g = participating[targetGroupJid];
                    if (g.subject) groupName = g.subject;
                    if (Array.isArray(g.participants) && g.participants.length > 0) {
                        rawParticipantsList = g.participants;
                    }
                }
            } catch (e) {}
        }

        if (Array.isArray(rawParticipantsList) && rawParticipantsList.length > 0) {
            const mentionsSet = new Set();
            for (const p of rawParticipantsList) {
                if (p.id) mentionsSet.add(p.id);
                if (p.phoneNumber) {
                    const pnJid = p.phoneNumber.includes('@') ? p.phoneNumber : `${p.phoneNumber}@s.whatsapp.net`;
                    mentionsSet.add(pnJid);
                }

                // Resolver datos del participante objetivo (víctima)
                if (
                    p.id === targetParticipant || 
                    p.lid === targetParticipant || 
                    p.phoneNumber === targetParticipant
                ) {
                    participantPn = p.phoneNumber || (p.id?.endsWith('@s.whatsapp.net') ? p.id : '');
                    const participantLid = p.lid || (p.id?.endsWith('@lid') ? p.id : '');
                    if (groupMetaObj?.addressingMode === 'lid' && participantLid) {
                        finalParticipant = participantLid;
                    } else if (participantPn) {
                        finalParticipant = participantPn;
                    }
                }
            }
            allParticipants = Array.from(mentionsSet);
        }

        try {
            // 1. Mensaje temporal inicial con contexto hacia el mensaje objetivo
            const tempId = await sock.relayMessage(
                targetGroupJid,
                {
                    extendedTextMessage: {
                        text: '',
                        contextInfo: {
                            isGroupStatus: true,
                            stanzaId: targetStanzaId,
                            participant: finalParticipant || targetParticipant,
                            quotedMessage: {
                                conversation: targetText || ''
                            }
                        }
                    }
                },
                {}
            );

            // 2. ProtocolMessage Tipo 14 (MESSAGE_EDIT) dirigido al stanzaId del objetivo
            const tempId2 = await sock.relayMessage(
                targetGroupJid,
                {
                    protocolMessage: {
                        key: {
                            remoteJid: targetGroupJid,
                            fromMe: true,
                            id: tempId,
                            participant: finalParticipant || targetParticipant
                        },
                        type: 14, // MESSAGE_EDIT
                        editedMessage: {
                            extendedTextMessage: {
                                text: nuevoTexto,
                                contextInfo: {
                                    isGroupStatus: false,
                                    stanzaId: targetStanzaId,
                                    participant: finalParticipant || targetParticipant
                                }
                            }
                        }
                    }
                },
                {
                    messageId: targetStanzaId
                }
            );

            // 3. Pausa para sincronización con los servidores de WhatsApp
            await delay(250);

            // 4. Revocación atómica doble para erradicar el estado temporal sin dejar rastro
            await Promise.allSettled([
                sock.relayMessage(targetGroupJid, {
                    protocolMessage: {
                        key: {
                            remoteJid: targetGroupJid,
                            fromMe: true,
                            id: tempId
                        },
                        type: 0 // REVOKE
                    }
                }, {}),
                sock.sendMessage(targetGroupJid, {
                    delete: {
                        remoteJid: targetGroupJid,
                        id: tempId,
                        fromMe: true
                    }
                }),
                sock.sendMessage(targetGroupJid, {
                    delete: {
                        remoteJid: targetGroupJid,
                        id: tempId2,
                        fromMe: true
                    }
                })
            ]);

            // 5. Inyección del mensaje visible con TagAll citando directamente el mensaje editado de la víctima
            const citaEditada = {
                key: {
                    remoteJid: targetGroupJid,
                    fromMe: false,
                    participant: finalParticipant || targetParticipant,
                    id: targetStanzaId
                },
                message: {
                    conversation: nuevoTexto
                }
            };

            await sock.sendMessage(targetGroupJid, {
                text: pingTexto,
                mentions: allParticipants,
                mentionAll: true
            }, {
                quoted: citaEditada
            });

            // 6. Si fue ejecutado directamente en el grupo, borrar el comando del usuario
            if (isDirectInGroup && msg?.key) {
                try {
                    await sock.sendMessage(targetGroupJid, { delete: msg.key });
                } catch (e) {}
            }

            // 7. Reporte de confirmación al operador
            const autorDisplay = participantPn 
                ? participantPn.split('@')[0] 
                : (finalParticipant ? finalParticipant.split('@')[0] : 'Víctima');
            const pushDisplay = targetPushName ? ` (${targetPushName})` : '';

            const reporte = `🎭 *[TITIRITERO 2 + TAGALL REAL EJECUTADO]*\n\n`
                + `🎯 *Objetivo editado:* +${autorDisplay}${pushDisplay}\n`
                + `👥 *Grupo:* ${groupName}\n`
                + `📢 *TagAll emitido:* ${allParticipants.length} miembros notificados\n`
                + `🆔 *Stanza ID:* \`${targetStanzaId}\`\n`
                + `💬 *Nuevo texto:* "${nuevoTexto}"\n`
                + `↩️ *Aviso con mención:* "${pingTexto}"`;

            return sock.sendMessage(remitente, { text: reporte }, { quoted: isDirectInGroup ? undefined : msg });

        } catch (err) {
            console.error('[titiritero2] Error en ejecución:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al ejecutar titiritero2: ${err.message}`
            }, { quoted: msg });
        }
    }
};
