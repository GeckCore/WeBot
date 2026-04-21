import { default as makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export default {
    name: 'botclone',
    match: (text) => /^\.(botclone|listclones|killclone\s+\d+)$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        
        // --- SISTEMA DE PERMISOS (SOLO OWNER) ---
        const OWNER = process.env.OWNER_NUMBER || '34682075812@s.whatsapp.net'; // Cambiar por tu número
        
        if (remitente !== OWNER) {
            return sock.sendMessage(remitente, { 
                text: "⛔ *Acceso denegado*\nSolo el owner puede usar estos comandos." 
            }, { quoted: msg });
        }
        
        // --- COMANDO: .listclones ---
        if (/^\.listclones$/i.test(textoLimpio)) {
            if (!global.botClones || global.botClones.size === 0) {
                return sock.sendMessage(remitente, { 
                    text: "📋 *No hay clones activos*\n\nUsa `.botclone` para crear uno." 
                }, { quoted: msg });
            }
            
            let lista = "📋 *CLONES ACTIVOS*\n\n";
            let index = 1;
            for (const [id, clone] of global.botClones.entries()) {
                const estado = clone.isConnected ? '🟢 Conectado' : '🔴 Desconectado';
                lista += `${index}. ID: ${id}\n   ${estado}\n   Creado: ${clone.createdAt}\n\n`;
                index++;
            }
            
            lista += `Total: ${global.botClones.size} clone(s)`;
            
            return sock.sendMessage(remitente, { text: lista }, { quoted: msg });
        }
        
        // --- COMANDO: .killclone N ---
        const killMatch = textoLimpio.match(/^\.killclone\s+(\d+)$/i);
        if (killMatch) {
            const cloneNumber = parseInt(killMatch[1]);
            
            if (!global.botClones || global.botClones.size === 0) {
                return sock.sendMessage(remitente, { 
                    text: "❌ No hay clones para eliminar." 
                }, { quoted: msg });
            }
            
            const cloneIds = Array.from(global.botClones.keys());
            if (cloneNumber < 1 || cloneNumber > cloneIds.length) {
                return sock.sendMessage(remitente, { 
                    text: `❌ Número inválido. Usa \`.listclones\` para ver los disponibles.` 
                }, { quoted: msg });
            }
            
            const cloneId = cloneIds[cloneNumber - 1];
            const clone = global.botClones.get(cloneId);
            
            try {
                // Cerrar la conexión del clone
                await clone.sock.logout();
                
                // Eliminar carpeta de autenticación
                const authDir = path.join(process.cwd(), `auth_clone_${cloneId}`);
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                }
                
                // Remover del registro
                global.botClones.delete(cloneId);
                
                return sock.sendMessage(remitente, { 
                    text: `✅ *Clone #${cloneNumber} eliminado*\n\nID: ${cloneId}` 
                }, { quoted: msg });
                
            } catch (err) {
                console.error('Error eliminando clone:', err);
                return sock.sendMessage(remitente, { 
                    text: `❌ Error al eliminar: ${err.message}` 
                }, { quoted: msg });
            }
        }
        
        // --- COMANDO: .botclone ---
        if (/^\.botclone$/i.test(textoLimpio)) {
            
            // Inicializar registro de clones si no existe
            if (!global.botClones) global.botClones = new Map();
            
            // Límite de clones simultáneos
            const MAX_CLONES = 5;
            if (global.botClones.size >= MAX_CLONES) {
                return sock.sendMessage(remitente, { 
                    text: `⚠️ *Límite alcanzado*\n\nMáximo ${MAX_CLONES} clones simultáneos.\nUsa \`.killclone N\` para liberar espacio.` 
                }, { quoted: msg });
            }
            
            const statusMsg = await sock.sendMessage(remitente, { 
                text: "🔄 *Iniciando clone...*\n\nEsto puede tardar unos segundos." 
            }, { quoted: msg });
            
            try {
                // ID único para este clone
                const cloneId = Date.now().toString();
                const authDir = `auth_clone_${cloneId}`;
                
                // Crear carpeta de autenticación
                if (!fs.existsSync(authDir)) {
                    fs.mkdirSync(authDir, { recursive: true });
                }
                
                const { state, saveCreds } = await useMultiFileAuthState(authDir);
                const { version } = await fetchLatestBaileysVersion();
                
                let qrData = null;
                let qrGenerated = false;
                
                const cloneSock = makeWASocket({
                    version,
                    auth: state,
                    printQRInTerminal: false,
                    browser: ['Clone Bot', 'Chrome', '122.0.0.0'],
                    syncFullHistory: false
                });
                
                // Guardar credenciales
                cloneSock.ev.on('creds.update', saveCreds);
                
                // Manejar QR
                cloneSock.ev.on('connection.update', async (update) => {
                    const { connection, qr, lastDisconnect } = update;
                    
                    if (qr && !qrGenerated) {
                        qrGenerated = true;
                        qrData = qr;
                        
                        try {
                            // Generar QR como imagen
                            const qrBuffer = await QRCode.toBuffer(qr, { 
                                errorCorrectionLevel: 'H',
                                margin: 1,
                                width: 512
                            });
                            
                            await sock.sendMessage(remitente, {
                                image: qrBuffer,
                                caption: `📱 *QR CODE - CLONE BOT*\n\n` +
                                        `ID: ${cloneId}\n\n` +
                                        `⏱️ Escanea en los próximos 60 segundos.\n` +
                                        `Este QR es de un solo uso.`
                            });
                            
                            await sock.sendMessage(remitente, { delete: statusMsg.key });
                            
                        } catch (err) {
                            console.error('Error generando QR:', err);
                            await sock.sendMessage(remitente, { 
                                text: `❌ Error generando QR: ${err.message}` 
                            });
                        }
                    }
                    
                    if (connection === 'open') {
                        console.log(`[CLONE ${cloneId}] Conectado exitosamente`);
                        
                        // Registrar clone activo
                        global.botClones.set(cloneId, {
                            sock: cloneSock,
                            isConnected: true,
                            createdAt: new Date().toLocaleString('es-ES'),
                            authDir: authDir
                        });
                        
                        // Notificar conexión exitosa
                        await sock.sendMessage(remitente, { 
                            text: `✅ *Clone conectado*\n\n` +
                                  `ID: ${cloneId}\n` +
                                  `Estado: 🟢 Activo\n\n` +
                                  `Usa \`.listclones\` para ver todos los clones.`
                        });
                        
                        // Iniciar procesamiento de mensajes para este clone
                        iniciarClone(cloneSock, cloneId);
                    }
                    
                    if (connection === 'close') {
                        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                        
                        if (global.botClones.has(cloneId)) {
                            global.botClones.get(cloneId).isConnected = false;
                        }
                        
                        console.log(`[CLONE ${cloneId}] Desconectado. Reconectar: ${shouldReconnect}`);
                        
                        if (!shouldReconnect) {
                            // Sesión inválida - limpiar
                            global.botClones.delete(cloneId);
                            if (fs.existsSync(authDir)) {
                                fs.rmSync(authDir, { recursive: true, force: true });
                            }
                            
                            await sock.sendMessage(remitente, { 
                                text: `⚠️ Clone ${cloneId} desconectado (sesión cerrada).` 
                            });
                        }
                    }
                });
                
                // Timeout del QR (60 segundos)
                setTimeout(async () => {
                    if (qrGenerated && !global.botClones.has(cloneId)) {
                        console.log(`[CLONE ${cloneId}] QR expirado sin conexión`);
                        
                        try {
                            await cloneSock.logout();
                        } catch (e) {}
                        
                        if (fs.existsSync(authDir)) {
                            fs.rmSync(authDir, { recursive: true, force: true });
                        }
                        
                        await sock.sendMessage(remitente, { 
                            text: `⏱️ *QR expirado*\n\nEl clone ${cloneId} no se conectó a tiempo.\nUsa \`.botclone\` nuevamente.` 
                        });
                    }
                }, 60000);
                
            } catch (err) {
                console.error('Error creando clone:', err);
                await sock.sendMessage(remitente, { 
                    text: `❌ Error al crear clone:\n${err.message}` 
                });
            }
        }
    }
};

// --- FUNCIÓN PARA INICIAR PROCESAMIENTO DE MENSAJES EN EL CLONE ---
function iniciarClone(cloneSock, cloneId) {
    
    cloneSock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        const remitente = msg.key.remoteJid;
        
        let texto = msg.message.conversation 
            || msg.message.extendedTextMessage?.text 
            || "";
        
        let buttonText = "";
        try {
            if (msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                buttonText = params.id || "";
            }
        } catch (e) {}
        
        if (!buttonText) {
            buttonText = msg?.message?.buttonsResponseMessage?.selectedButtonId 
                || msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId
                || msg?.message?.templateButtonReplyMessage?.selectedId
                || "";
        }
        
        if (buttonText) texto = buttonText;
        
        const textoLimpio = texto.trim();
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!textoLimpio && !msgType && !buttonText) return;
        
        const isGroup = remitente.endsWith('@g.us');
        const settings = global.db?.data?.settings || { grupos: true };
        
        if (isGroup && settings.grupos === false) return;
        
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
        
        const getMediaInfo = (msgObj) => {
            if (!msgObj) return null;
            if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
            if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
            if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
            if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
            return null;
        };
        
        const ctx = { 
            sock: cloneSock,
            msg, 
            remitente, 
            textoLimpio, 
            getMediaInfo, 
            downloadContentFromMessage, 
            quoted, 
            msgType 
        };
        
        // Usar los plugins globales
        if (global.plugins) {
            for (const plugin of global.plugins) {
                if (plugin.match && plugin.match(textoLimpio, ctx)) {
                    try {
                        await plugin.execute(ctx);
                        if (global.db) global.db.write();
                    } catch (err) {
                        console.error(`[CLONE ${cloneId}] Error en plugin ${plugin.name}:`, err);
                    }
                    break;
                }
            }
        }
    });
    
    console.log(`[CLONE ${cloneId}] Sistema de mensajes iniciado`);
}
