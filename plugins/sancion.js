import fs from 'fs';
import path from 'path';

export default {
    name: 'sancion_oficial_meta',
    match: (text) => /^\.(sancion|metawarn|avisometa|advertencia)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { 
                text: "❌ Este módulo de notificación disciplinaria está diseñado para ejecutarse en grupos." 
            }, { quoted: msg });
        }

        // Obtener usuario objetivo: por mención o respondiendo al mensaje de alguien
        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            || msg.message?.extendedTextMessage?.contextInfo?.participant;

        if (!mentionedJid) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes mencionar a la persona o responder a su mensaje.\n📌 *Uso:* `.sancion @usuario [motivo opcional]`\n_Ejemplo:_ `.sancion @usuario Reportes reiterados de spam y conducta maliciosa`" 
            }, { quoted: msg });
        }

        const rawInput = textoLimpio.replace(/^\.(sancion|metawarn|avisometa|advertencia)\s*/i, '').replace(/@\d+/g, '').trim();
        const motivo = rawInput || 'Reportes acumulados por conducta sospechosa y vulneración de los Términos de Servicio';

        try {
            // 1. Borrado del comando invocador para máximo sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Generación de identificadores de caso realistas
            const numeroLimpio = mentionedJid.split('@')[0];
            const caseId = Math.floor(1000 + Math.random() * 9000);
            const refHash = Math.random().toString(36).substring(2, 8).toUpperCase();
            const fechaHoy = new Date().toLocaleDateString('es-ES', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric' 
            });

            const textoSancion = `🛡️ *META PLATFORMS // SEGURIDAD Y CUMPLIMIENTO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*EXPEDIENTE:* \`WA-SEC-${caseId}-${refHash}\`
*AUDITORÍA:* \`EN EJECUCIÓN\`
*TITULAR:* @${numeroLimpio}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *NOTIFICACIÓN DISCIPLINARIA (NIVEL II / AMONESTACIÓN PREVIA)*
Los sistemas automatizados de integridad de Meta y los algoritmos de detección de telemetría han procesado múltiples reportes sobre esta línea.

📊 *ESTADO DE ADVERTENCIAS REGISTRADAS:*
\`[ ⚠️ ADVERTENCIA 1 DE 3 ] : REGISTRADA\`
\`[ ⚠️ ADVERTENCIA 2 DE 3 ] : ACTIVA\` ◄ *ACTUAL*
\`[ 🛑 ADVERTENCIA 3 DE 3 ] : SUSPENSIÓN PERMANENTE\`

📋 *DETALLES DEL INFORME TÉCNICO:*
• *Infracción tipificada:* ${motivo}
• *Identificador de red:* \`UID-${numeroLimpio.slice(-4)}-${refHash}\`
• *Fecha de emisión:* ${fechaHoy}
• *Medidas cautelares:* Monitoreo automatizado de tráfico y restricción temporal de funciones de red.

⚠️ *ADVERTENCIA VINCULANTE:*
En caso de registrarse *1 advertencia adicional*, los servidores de WhatsApp procederán al bloqueo y revocación definitiva e irrevocable de las credenciales de esta cuenta en la infraestructura de Meta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Para consultar los estándares comunitarios y términos de uso aceptable, diríjase al portal de asistencia técnica oficial de WhatsApp._`;

            // 3. Miniatura oficial
            let thumbBuffer = null;
            try {
                const res = await fetch("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/240px-WhatsApp.svg.png");
                if (res.ok) {
                    thumbBuffer = Buffer.from(await res.arrayBuffer());
                }
            } catch (e) {}

            if (!thumbBuffer) {
                const localLogo = path.join(process.cwd(), 'docs/media/logo.jpg');
                if (fs.existsSync(localLogo)) {
                    thumbBuffer = fs.readFileSync(localLogo);
                }
            }

            // 4. Inyección con canal oficial y tarjeta interactiva de soporte
            await sock.sendMessage(remitente, {
                text: textoSancion,
                contextInfo: {
                    mentionedJid: [mentionedJid],
                    isForwarded: true,
                    forwardingScore: 1,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363161512345678@newsletter",
                        newsletterName: "WhatsApp Support & Safety Operations ✓",
                        serverMessageId: 100 + caseId
                    },
                    externalAdReply: {
                        title: `Meta Security Operations // Case #${caseId}`,
                        body: "Aviso Oficial de Moderación e Integridad de Cuenta",
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        thumbnail: thumbBuffer,
                        sourceUrl: "https://faq.whatsapp.com/590554162985396"
                    }
                }
            });

        } catch (err) {
            console.error("Error Sanción Meta:", err);
            await sock.sendMessage(remitente, { 
                text: `❌ Error al emitir la notificación disciplinaria: ${err.message}` 
            });
        }
    }
};
