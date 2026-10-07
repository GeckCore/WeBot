import { delay } from '@whiskeysockets/baileys';

export default {
    name: 'fakemessage',
    // Captura .fakemsg o .fakemessage con o sin argumentos
    match: (text) => /^\.(fakemsg|fakemessage)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted, msgType }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { 
                text: '❌ Este comando solo se puede usar en grupos.' 
            }, { quoted: msg });
        }

        // Obtener contextInfo de texto o de multimedia citada
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const hasQuoted = Boolean(quoted || contextInfo?.quotedMessage);
        const stanzaId = contextInfo?.stanzaId;

        if (!hasQuoted) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ Responda al mensaje que desea procesar.' 
            }, { quoted: msg });
        }

        const text = textoLimpio.replace(/^\.(fakemsg|fakemessage)\s*/i, '').trim();
        if (!text) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ Introduzca el texto de reemplazo.\n*Ejemplo:* `.fakemsg Mensaje de reemplazo`' 
            }, { quoted: msg });
        }

        if (!stanzaId) {
            return sock.sendMessage(remitente, { 
                text: '❌ No se pudo identificar el ID del mensaje citado.' 
            }, { quoted: msg });
        }

        try {
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
                                text,
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
                })
            ]);
        } catch (e) {
            console.error('[fakemsg]', e);
            await sock.sendMessage(remitente, { 
                text: `❌ Error: ${e?.message || e}` 
            }, { quoted: msg });
        }
    }
};
