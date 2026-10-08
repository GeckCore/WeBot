import { delay } from '@whiskeysockets/baileys';

export default {
    name: 'censurar_mensaje',
    match: (text) => /^\.(censurar|censor)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted, msgType }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { 
                text: '❌ Este comando solo se puede usar en grupos.' 
            }, { quoted: msg });
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const hasQuoted = Boolean(quoted || contextInfo?.quotedMessage || contextInfo?.stanzaId);
        const stanzaId = contextInfo?.stanzaId;

        if (!hasQuoted || !stanzaId) {
            return sock.sendMessage(remitente, { 
                text: '❌ Responde al mensaje que deseas censurar.\n📌 *Uso:* `.censurar [motivo]`' 
            }, { quoted: msg });
        }

        // Extraer motivo personalizado si existe
        const motivoCustom = textoLimpio.replace(/^\.(censurar|censor)\s*/i, '').trim();
        const motivo = motivoCustom || 'Infracción a las normas de la comunidad y convivencia';
        const textoCensura = `🛑 [MENSAJE CENSURADO POR EL ADMINISTRADOR]\nMotivo: ${motivo}`;

        try {
            // 1. Mensaje temporal
            const tempId = await sock.relayMessage(
                remitente,
                {
                    extendedTextMessage: {
                        text: '',
                        contextInfo: {
                            isGroupStatus: true
                        }
                    }
                },
                {
                    quoted: msg
                }
            );

            // 2. ProtocolMessage tipo 14 para sustituir el mensaje original
            const tempId2 = await sock.relayMessage(
                remitente,
                {
                    protocolMessage: {
                        key: {
                            jid: remitente,
                            fromMe: true,
                            id: tempId
                        },
                        type: 14,
                        editedMessage: {
                            extendedTextMessage: {
                                text: textoCensura,
                                contextInfo: {
                                    isGroupStatus: false
                                }
                            }
                        }
                    }
                },
                {
                    messageId: stanzaId
                }
            );

            await delay(100);

            // 3. Limpieza de temporales y eliminación del comando para sigilo total
            await Promise.allSettled([
                sock.sendMessage(remitente, {
                    delete: {
                        remoteJid: remitente,
                        id: tempId,
                        fromMe: true
                    }
                }),
                sock.sendMessage(remitente, {
                    delete: {
                        remoteJid: remitente,
                        id: tempId2,
                        fromMe: true
                    }
                }),
                sock.sendMessage(remitente, { delete: msg.key })
            ]);

        } catch (e) {
            console.error('[censurar]', e);
            await sock.sendMessage(remitente, { 
                text: '❌ Error al aplicar censura: ' + (e?.message || e) 
            }, { quoted: msg });
        }
    }
};
