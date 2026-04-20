import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

// ==========================================
// DETECCIÓN AUTOMÁTICA DE BINARIOS
// ==========================================
const findBinary = async (name) => {
    const isWindows = process.platform === 'win32';
    const extensions = isWindows ? ['.exe', ''] : ['', '.exe'];
    
    // 1. Buscar en el directorio raíz del proyecto
    for (const ext of extensions) {
        const localPath = path.resolve(`./${name}${ext}`);
        if (fs.existsSync(localPath)) {
            console.log(`[BINARY] Encontrado ${name} en: ${localPath}`);
            return localPath;
        }
    }
    
    // 2. Buscar en PATH del sistema
    try {
        const cmd = isWindows ? `where ${name}` : `which ${name}`;
        const { stdout } = await execPromise(cmd);
        const systemPath = stdout.trim().split('\n')[0];
        if (systemPath && fs.existsSync(systemPath)) {
            console.log(`[BINARY] Encontrado ${name} en PATH: ${systemPath}`);
            return systemPath;
        }
    } catch (e) {
        // No está en PATH
    }
    
    throw new Error(`❌ No se encontró el binario "${name}". Descárgalo y colócalo en la raíz del proyecto.`);
};

// ==========================================
// GENERADOR DE EXIF SPOOFED (CHOMP GLITCH)
// ==========================================
const createChompExif = (packname = "Chomp", author = "WhatsApp") => {
    // JSON con metadatos del pack oficial de Chomp
    const json = {
        "sticker-pack-id": "com.snowcorp.stickerly.android.stickercontentprovider b5e7275f-f1de-4137-961f-57becfad34f2", // ID real del pack Chomp
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "android-app-store-link": "https://play.google.com/store/apps/details?id=com.marsvard.stickermaker",
        "ios-app-store-link": "https://apps.apple.com/app/sticker-maker-studio/id1443326857",
        "emojis": ["💀", "😈"] // Emojis que mostrarán el glitch
    };
    
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
    
    // Header EXIF estándar (Little Endian TIFF)
    const exifHeader = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, // TIFF header (Little Endian)
        0x08, 0x00, 0x00, 0x00, // Offset del primer IFD
        0x01, 0x00,             // Número de entradas (1)
        0x41, 0x57,             // Tag 0x5741 (UserComment - metadatos personalizados)
        0x07, 0x00,             // Tipo: ASCII
        0x00, 0x00, 0x00, 0x00  // Longitud del valor (se escribirá después)
    ]);
    
    // Offset donde comienza el JSON (después del header)
    const jsonOffset = Buffer.alloc(4);
    jsonOffset.writeUInt32LE(22, 0); // Offset = 22 bytes (tamaño del header)
    
    // Longitud del JSON
    exifHeader.writeUInt32LE(jsonBuffer.length, 14);
    
    // Ensamblar: Header + Offset + JSON + Null terminator
    return Buffer.concat([
        exifHeader,
        jsonOffset,
        jsonBuffer,
        Buffer.from([0x00, 0x00, 0x00, 0x00]) // IFD terminator
    ]);
};

// ==========================================
// COMANDO PRINCIPAL
// ==========================================
export default {
    name: 'sticker_glitch_chomp',
    match: (text, { quoted, getMediaInfo }) => {
        const cmd = text.toLowerCase().trim();
        return (cmd === '.sg' || cmd === '.chomp') && quoted && getMediaInfo(quoted);
    },
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        
        // Validar que sea imagen o video
        if (!['image', 'video'].includes(mediaInfo.type)) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes responder a una *imagen* o *video* con `.sg`" 
            }, { quoted: msg });
        }
        
        const statusMsg = await sock.sendMessage(remitente, { 
            text: "💀 Generando Chomp Glitch..." 
        }, { quoted: msg });
        
        const idStr = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const tmpDir = path.resolve('./tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        
        const inputPath = path.join(tmpDir, `in_${idStr}.${mediaInfo.ext}`);
        const rawWebpPath = path.join(tmpDir, `raw_${idStr}.webp`);
        const exifPath = path.join(tmpDir, `exif_${idStr}.exif`);
        const outputPath = path.join(tmpDir, `chomp_${idStr}.webp`);
        
        try {
            // ==========================================
            // 1. DESCARGAR MEDIA
            // ==========================================
            console.log(`[CHOMP] Descargando ${mediaInfo.type}...`);
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(inputPath, buffer);
            console.log(`[CHOMP] Media guardada: ${inputPath} (${(buffer.length / 1024).toFixed(2)} KB)`);
            
            // ==========================================
            // 2. LOCALIZAR BINARIOS
            // ==========================================
            const ffmpegPath = await findBinary('ffmpeg');
            const webpmuxPath = await findBinary('webpmux');
            
            // ==========================================
            // 3. CONVERTIR A WEBP CON FFMPEG
            // ==========================================
            const isVideo = mediaInfo.type === 'video';
            
            // Filtro optimizado para stickers de WhatsApp (512x512, fondo transparente)
            const videoFilters = [
                "scale=512:512:force_original_aspect_ratio=decrease", // Ajustar al tamaño máximo manteniendo aspecto
                "format=rgba",                                         // Forzar canal alpha
                "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",   // Centrar y rellenar con transparencia
                "fps=15"                                               // 15 FPS para videos
            ].join(',');
            
            const imageFilters = [
                "scale=512:512:force_original_aspect_ratio=decrease",
                "format=rgba",
                "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000"
            ].join(',');
            
            const ffmpegCmd = isVideo 
                ? `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -vf "${videoFilters}" -lossless 0 -compression_level 6 -q:v 50 -loop 0 -preset picture -an -vsync 0 -t 6 "${rawWebpPath}" -y`
                : `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -vf "${imageFilters}" -lossless 1 -compression_level 6 -q:v 90 -preset picture "${rawWebpPath}" -y`;
            
            console.log(`[CHOMP] Ejecutando FFMPEG...`);
            const { stderr: ffmpegErr } = await execPromise(ffmpegCmd);
            
            if (!fs.existsSync(rawWebpPath) || fs.statSync(rawWebpPath).size === 0) {
                throw new Error(`FFMPEG falló. Log:\n${ffmpegErr}`);
            }
            
            const webpSize = fs.statSync(rawWebpPath).size;
            console.log(`[CHOMP] WebP generado: ${(webpSize / 1024).toFixed(2)} KB`);
            
            // ==========================================
            // 4. GENERAR EXIF CON METADATOS DE CHOMP
            // ==========================================
            console.log(`[CHOMP] Creando EXIF spoofed...`);
            const exifBuffer = createChompExif("💀 Chomp", "WhatsApp Inc.");
            fs.writeFileSync(exifPath, exifBuffer);
            console.log(`[CHOMP] EXIF creado: ${exifBuffer.length} bytes`);
            
            // ==========================================
            // 5. INYECTAR EXIF EN EL WEBP CON WEBPMUX
            // ==========================================
            console.log(`[CHOMP] Inyectando EXIF con webpmux...`);
            
            // Sintaxis correcta de webpmux
            const webpmuxCmd = `"${webpmuxPath}" -set exif "${exifPath}" "${rawWebpPath}" -o "${outputPath}"`;
            
            try {
                const { stderr: muxErr } = await execPromise(webpmuxCmd);
                console.log(`[CHOMP] Webpmux output: ${muxErr || 'OK'}`);
            } catch (muxError) {
                console.error(`[CHOMP] Error webpmux:`, muxError);
                throw new Error(`Webpmux falló: ${muxError.message}`);
            }
            
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                throw new Error("Webpmux no generó el archivo de salida.");
            }
            
            const finalSize = fs.statSync(outputPath).size;
            console.log(`[CHOMP] ✅ Sticker final: ${(finalSize / 1024).toFixed(2)} KB`);
            
            // ==========================================
            // 6. ENVIAR STICKER CON GLITCH
            // ==========================================
            await sock.sendMessage(remitente, { 
                sticker: fs.readFileSync(outputPath) 
            }, { quoted: msg });
            
            // Eliminar mensaje de estado
            try {
                await sock.sendMessage(remitente, { delete: statusMsg.key });
            } catch (e) {
                // Ignorar si no se puede eliminar
            }
            
            console.log(`[CHOMP] ✅ Sticker enviado correctamente`);
            
        } catch (err) {
            console.error("[CHOMP] ❌ Error crítico:", err);
            
            let errorMsg = "❌ *Error generando Chomp Glitch*\n\n";
            
            if (err.message.includes('No se encontró el binario')) {
                errorMsg += err.message + "\n\n";
                errorMsg += "📥 *Descarga los binarios:*\n";
                errorMsg += "• FFmpeg: https://ffmpeg.org/download.html\n";
                errorMsg += "• Webpmux: https://developers.google.com/speed/webp/download";
            } else if (err.message.includes('FFMPEG falló')) {
                errorMsg += "• Error al convertir la imagen/video\n";
                errorMsg += "• Verifica que el archivo no esté corrupto";
            } else if (err.message.includes('Webpmux falló')) {
                errorMsg += "• Error al inyectar metadatos EXIF\n";
                errorMsg += "• Verifica que webpmux esté instalado correctamente";
            } else {
                errorMsg += `• ${err.message}`;
            }
            
            await sock.sendMessage(remitente, { text: errorMsg }, { quoted: msg });
            
        } finally {
            // ==========================================
            // 7. LIMPIEZA DE ARCHIVOS TEMPORALES
            // ==========================================
            const filesToDelete = [inputPath, rawWebpPath, exifPath, outputPath];
            let deletedCount = 0;
            
            for (const file of filesToDelete) {
                if (fs.existsSync(file)) {
                    try {
                        fs.unlinkSync(file);
                        deletedCount++;
                    } catch (e) {
                        console.error(`[CHOMP] No se pudo eliminar: ${file}`);
                    }
                }
            }
            
            console.log(`[CHOMP] Limpieza: ${deletedCount}/${filesToDelete.length} archivos eliminados`);
        }
    }
};
