import { delay } from '@whiskeysockets/baileys';

export default {
    name: 'titiritero',
    match: (text) => /^\.(grupos|mensajes|msj|titiritero)(\s+.*)?$/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const match = textoLimpio.match(/^\.(grupos|mensajes|msj|titiritero)(?:\s+(.*))?$/i);
        if (!match) return;

        const cmd = '.' + match[1].toLowerCase();
        const args = (match[2] || '').trim();

        // ==========================================
        // 1. COMANDO: .grupos (Listar grupos disponibles)
        // ==========================================
        if (cmd === '.grupos') {
            try {
                const participating = await sock.groupFetchAllParticipating();
                const groupList = Object.values(participating);

                if (!groupList.length) {
                    return sock.sendMessage(remitente, { 
                        text: '⚠️ El bot no participa actualmente en ningún grupo.' 
                    }, { quoted: msg });
                }

                global.cachedGroupList = groupList.map((g, index) => ({
                    index: index + 1,
                    id: g.id,
                    subject: g.subject || 'Sin nombre',
                    participantsCount: g.participants?.length || 0,
                    addressingMode: g.addressingMode || 'lid'
                }));

                let texto = `📋 *GRUPOS ACTIVOS VINCULADOS (${global.cachedGroupList.length})*\n\n`;
                global.cachedGroupList.forEach((g) => {
                    texto += `*[${g.index}]* ${g.subject}\n   └ 👥 ${g.participantsCount} miembros\n   └ 🆔 \`${g.id}\`\n\n`;
                });

                texto += `🎭 *Siguiente paso:*\nUsa \`.mensajes <número>\` para ver los últimos mensajes de ese grupo.\n_Ejemplo:_ \`.mensajes 1\``;

                return sock.sendMessage(remitente, { text: texto }, { quoted: msg });
            } catch (err) {
                console.error('[titiritero] Error listando grupos:', err);
                return sock.sendMessage(remitente, { 
                    text: `❌ Error al obtener la lista de grupos: ${err.message}` 
                }, { quoted: msg });
            }
        }

        // ==========================================
        // 2. COMANDO: .mensajes / .msj (Ver mensajes recientes de un grupo)
        // ==========================================
        if (cmd === '.mensajes' || cmd === '.msj') {
            let targetJid = null;
            let groupName = 'Grupo';

            const idx = parseInt(args, 10);
            if (!isNaN(idx) && global.cachedGroupList?.[idx - 1]) {
                targetJid = global.cachedGroupList[idx - 1].id;
                groupName = global.cachedGroupList[idx - 1].subject;
            } else if (args && args.endsWith('@g.us')) {
                targetJid = args;
            } else if (remitente.endsWith('@g.us')) {
                targetJid = remitente;
            } else if (global.lastViewedGroup) {
                targetJid = global.lastViewedGroup;
            } else if (global.cachedGroupList?.length > 0) {
                targetJid = global.cachedGroupList[0].id;
                groupName = global.cachedGroupList[0].subject;
            }

            if (!targetJid) {
                return sock.sendMessage(remitente, { 
                    text: '❌ No se especificó ningún grupo.\n📌 *Uso:* Primero usa `.grupos` y luego `.mensajes 1`.' 
                }, { quoted: msg });
            }

            global.lastViewedGroup = targetJid;
            const buffer = global.recentGroupMessages.get(targetJid) || [];

            // Mapear participantes y LIDs a teléfonos reales desde la metadata del grupo
            const participantMap = new Map();
            try {
                const metadata = await sock.groupMetadata(targetJid).catch(() => null);
                if (metadata) {
                    groupName = metadata.subject || groupName;
                    if (Array.isArray(metadata.participants)) {
                        for (const p of metadata.participants) {
                            const pn = p.phoneNumber || (p.id?.endsWith('@s.whatsapp.net') ? p.id : '');
                            const lid = p.lid || (p.id?.endsWith('@lid') ? p.id : '');
                            if (p.id) participantMap.set(p.id, { pn, lid });
                            if (lid) participantMap.set(lid, { pn, lid });
                            if (pn) participantMap.set(pn, { pn, lid });
                        }
                    }
                }
            } catch (e) {}

            if (!buffer.length) {
                return sock.sendMessage(remitente, { 
                    text: `📜 *MENSAJES EN: ${groupName}*\n\n⚠️ No hay mensajes registrados en memoria aún para este grupo.\n_Pide o espera a que alguien escriba en el grupo mientras el bot está conectado._` 
                }, { quoted: msg });
            }

            let texto = `📜 *MENSAJES CAPTURADOS EN: ${groupName}*\n\n`;
            const mensajesMostrar = buffer.slice(0, 15);

            mensajesMostrar.forEach((m, i) => {
                const resolved = participantMap.get(m.participant);
                const realPn = resolved?.pn || (m.participant?.endsWith('@s.whatsapp.net') ? m.participant : '');
                const phoneDisplay = realPn ? realPn.split('@')[0] : (m.participant ? m.participant.split('@')[0] : 'Desconocido');
                const nombreDisplay = m.pushName ? ` (${m.pushName})` : '';

                texto += `*[${i + 1}]* +${phoneDisplay}${nombreDisplay}:\n   💬 "${m.text}"\n   🆔 \`${m.id}\`\n\n`;
            });

            texto += `🎭 *Acciones disponibles con este grupo:*\n`
                + `• \`.titiritero <número> | <nuevo_texto>\` (Modifica el mensaje real en vivo)\n`
                + `• \`.fake3 <número> | <texto_falso> | [respuesta]\` (Inyecta cita falsa atribuida a la víctima)\n`
                + `_Ejemplo:_ \`.fake3 1 | Yo rompí la taza | ¿Por qué lo hiciste? 😱\``;

            return sock.sendMessage(remitente, { text: texto }, { quoted: msg });
        }

        // ==========================================
        // 3. COMANDO: .titiritero (Modificación remota / en grupo)
        // ==========================================
        if (cmd === '.titiritero') {
            let targetGroupJid = remitente.endsWith('@g.us') ? remitente : global.lastViewedGroup;
            let targetStanzaId = null;
            let targetParticipant = '';
            let targetText = '';
            let nuevoTexto = '';
            let isDirectInGroup = false;

            // ContextInfo citado
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo
                || msg.message?.imageMessage?.contextInfo
                || msg.message?.videoMessage?.contextInfo
                || (msgType ? msg.message?.[msgType]?.contextInfo : null);

            // Caso A: Usado directamente en un grupo citando el mensaje
            if (contextInfo?.stanzaId && remitente.endsWith('@g.us')) {
                targetGroupJid = remitente;
                targetStanzaId = contextInfo.stanzaId;
                targetParticipant = contextInfo.participant || '';
                nuevoTexto = args.trim();
                isDirectInGroup = true;
            }

            // Caso B: Parsear argumentos remotos con separador '|'
            if (!targetStanzaId) {
                const sepIndex = args.indexOf('|');
                if (sepIndex === -1) {
                    return sock.sendMessage(remitente, { 
                        text: '❌ Formato incorrecto.\n📌 *Uso remoto:* `.titiritero <número> | <nuevo_texto>`\n_Ejemplo:_ `.titiritero 1 | Mañana pago yo la cuenta`\n📌 *O con ID:* `.titiritero <ID_MENSAJE> | <nuevo_texto>`' 
                    }, { quoted: msg });
                }

                const targetSelector = args.slice(0, sepIndex).trim();
                nuevoTexto = args.slice(sepIndex + 1).trim();

                if (!nuevoTexto) {
                    return sock.sendMessage(remitente, { 
                        text: '❌ Introduce el texto de reemplazo tras la barra vertical (|).' 
                    }, { quoted: msg });
                }

                // Selector numérico (ej: "1" o "2")
                const mIdx = parseInt(targetSelector, 10) - 1;
                if (!isNaN(mIdx) && mIdx >= 0) {
                    if (!targetGroupJid && global.cachedGroupList?.length > 0) {
                        targetGroupJid = global.cachedGroupList[0].id;
                    }

                    if (targetGroupJid) {
                        const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                        if (buf[mIdx]) {
                            targetStanzaId = buf[mIdx].id;
                            targetParticipant = buf[mIdx].participant;
                            targetText = buf[mIdx].text;
                        }
                    }
                } else {
                    // ID de mensaje directo
                    targetStanzaId = targetSelector;
                    // Buscar en buffer para obtener autor
                    if (targetGroupJid) {
                        const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                        const found = buf.find(item => item.id === targetSelector);
                        if (found) {
                            targetParticipant = found.participant;
                            targetText = found.text;
                        }
                    }
                }
            }

            if (!targetGroupJid) {
                return sock.sendMessage(remitente, { 
                    text: '❌ No hay ningún grupo objetivo seleccionado.\nUsa primero `.grupos` y luego `.mensajes 1`.' 
                }, { quoted: msg });
            }

            if (!targetStanzaId) {
                return sock.sendMessage(remitente, { 
                    text: '❌ No se pudo localizar el mensaje objetivo en el buffer.\nAsegúrate de ingresar un número válido de `.mensajes`.' 
                }, { quoted: msg });
            }

            // Resolver metadata del grupo para asegurar JID y LID exactos del participante
            let finalParticipant = targetParticipant;
            let participantPn = '';
            let participantLid = '';

            try {
                const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
                if (metadata?.participants) {
                    const matchPart = metadata.participants.find(p => 
                        p.id === targetParticipant || 
                        p.lid === targetParticipant || 
                        p.phoneNumber === targetParticipant
                    );
                    if (matchPart) {
                        participantPn = matchPart.phoneNumber || (matchPart.id?.endsWith('@s.whatsapp.net') ? matchPart.id : '');
                        participantLid = matchPart.lid || (matchPart.id?.endsWith('@lid') ? matchPart.id : '');
                        
                        // Si el grupo utiliza modo LID, priorizar LID; de lo contrario, JID estándar
                        if (metadata.addressingMode === 'lid' && participantLid) {
                            finalParticipant = participantLid;
                        } else if (participantPn) {
                            finalParticipant = participantPn;
                        }
                    }
                }
            } catch (err) {}

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

                // 3. Pausa para sincronización con los servidores de WhatsApp (evita carreras de paquetes)
                await delay(250);

                // 4. Revocación atómica doble para erradicar el estado temporal sin dejar rastro
                await Promise.allSettled([
                    // A. ProtocolMessage REVOKE directo
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
                    // B. Delete estándar de Baileys para tempId
                    sock.sendMessage(targetGroupJid, {
                        delete: {
                            remoteJid: targetGroupJid,
                            id: tempId,
                            fromMe: true
                        }
                    }),
                    // C. Delete de tempId2
                    sock.sendMessage(targetGroupJid, {
                        delete: {
                            remoteJid: targetGroupJid,
                            id: tempId2,
                            fromMe: true
                        }
                    })
                ]);

                // 5. Si fue ejecutado directamente en el grupo, borrar el comando del usuario
                if (isDirectInGroup && msg?.key) {
                    try {
                        await sock.sendMessage(targetGroupJid, { delete: msg.key });
                    } catch (e) {}
                }

                // 6. Reporte de confirmación al operador
                const autorDisplay = participantPn ? participantPn.split('@')[0] : (finalParticipant ? finalParticipant.split('@')[0] : 'Víctima');
                const reporte = `🎭 *[TITIRITERO EJECUTADO]*\n\n🎯 *Objetivo:* +${autorDisplay}\n🆔 *Stanza ID:* \`${targetStanzaId}\`\n💬 *Nuevo texto:* "${nuevoTexto}"\n🔒 *Sigilo:* Transmisión completada y temporales erradicados.`;

                return sock.sendMessage(remitente, { text: reporte }, { quoted: isDirectInGroup ? undefined : msg });

            } catch (err) {
                console.error('[titiritero] Error en ejecución:', err);
                return sock.sendMessage(remitente, { 
                    text: `❌ Error al ejecutar titiritero: ${err.message}` 
                }, { quoted: msg });
            }
        }
    }
};
