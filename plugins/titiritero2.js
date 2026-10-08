// plugins/titiritero2.js
const { delay } = require('@whiskeysockets/baileys');

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
        let pingTexto = '👀';
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
                    + "📢 *Efecto:* Modifica el mensaje de la víctima y responde en el acto con un **TagAll real** citando el mensaje alterado.";
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
        // OBTENCIÓN DE PARTICIPANTES PARA TAGALL
        // ==========================================
        let allParticipants = [];
        let finalParticipant = targetParticipant;
        let participantPn = '';

        try {
            const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
            if (metadata) {
                groupName = metadata.subject || groupName;
                if (Array.isArray(metadata.participants)) {
                    allParticipants = metadata.participants.map(p => p.id).filter(Boolean);

                    const matchPart = metadata.participants.find(p => 
                        p.id === targetParticipant || 
                        p.lid === targetParticipant || 
                        p.phoneNumber === targetParticipant
                    );
                    if (matchPart) {
                        participantPn = matchPart.phoneNumber || (matchPart.id?.endsWith('@s.whatsapp.net') ? matchPart.id : '');
                        const participantLid = matchPart.lid || (matchPart.id?.endsWith('@lid') ? matchPart.id : '');
                        if (metadata.addressingMode === 'lid' && participantLid) {
                            finalParticipant = participantLid;
                        } else if (participantPn) {
                            finalParticipant = participantPn;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[titiritero2] Error obteniendo metadata:', e);
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

            // 5. Inyección de la notificación TagAll real citando directamente el mensaje editado de la víctima
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
                mentions: allParticipants
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
                + `↩️ *Aviso/Cita enviada:* "${pingTexto}"`;

            return sock.sendMessage(remitente, { text: reporte }, { quoted: isDirectInGroup ? undefined : msg });

        } catch (err) {
            console.error('[titiritero2] Error en ejecución:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al ejecutar titiritero2: ${err.message}`
            }, { quoted: msg });
        }
    }
};
