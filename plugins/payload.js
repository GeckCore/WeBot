export default {
    name: 'fake_payload_size',
    match: (text) => /^\.payload/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Destrucción de evidencia
        try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        // Extraemos un nombre personalizado si el usuario lo pone (Ej: .payload GTA_VI_Beta.apk)
        let nombreArchivo = textoLimpio.replace(/^\.payload\s*/i, '').trim();
        if (!nombreArchivo) nombreArchivo = "System_Rootkit_Bypass.exe";

        // Creamos un archivo real en la RAM que pesa menos de 50 bytes
        const fakeBuffer = Buffer.from("01001000 01100001 01100011 01101011\n\nERROR 0x80070570: El archivo está corrupto o cifrado.");

        try {
            await sock.sendMessage(remitente, {
                document: fakeBuffer,
                // Engañamos a la interfaz haciéndole creer que es un ejecutable peligroso
                mimetype: 'application/x-msdownload', 
                fileName: nombreArchivo,
                // --- EXPLOIT DE METADATOS ---
                // 999999999999 bytes = ~931 Gigabytes. 
                // WhatsApp renderizará esto textualmente en la burbuja del chat.
                fileLength: 999999999999, 
                pageCount: 666, // Parámetro fantasma
                caption: "⚠️ *CARGA DE DATOS MASIVA*\n\nTransferencia interceptada. No intentes abrir esto si no tienes espacio en disco.",
                contextInfo: {
                    externalAdReply: {
                        title: "INTEGRIDAD COMPROMETIDA",
                        body: "Peso anómalo detectado",
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        // Un icono de advertencia rojo y negro agresivo
                        thumbnailUrl: "https://i.imgur.com/K1bK5fA.jpeg", 
                        sourceUrl: "https://wa.me/settings"
                    }
                }
            }, { quoted: msg });

        } catch (err) {
            console.error("Error Payload Glitch:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en la inyección de metadatos: ${err.message}` });
        }
    }
};
