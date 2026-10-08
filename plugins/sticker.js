// plugins/sticker.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const { ensureFfmpegAvailable } = require('../src/utils/ffmpeg');

// --- GENERADOR DE METADATOS EXIF (PACK / AUTOR) PARA WHATSAPP ---
function createExif(pack = 'WeBot', author = 'Agostini', categories = ['🤖']) {
    const json = {
        'sticker-pack-id': 'com.webot.sticker',
        'sticker-pack-name': pack,
        'sticker-pack-publisher': author,
        'emojis': Array.isArray(categories) ? categories : [categories]
    };
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    exifAttr.writeUInt32LE(jsonBuff.length, 14);
    return Buffer.concat([exifAttr, jsonBuff]);
}

function addExifToWebp(webpBuffer, pack = 'WeBot', author = 'Agostini') {
    if (!Buffer.isBuffer(webpBuffer) || webpBuffer.length < 12) return webpBuffer;
    if (webpBuffer.slice(0, 4).toString() !== 'RIFF' || webpBuffer.slice(8, 12).toString() !== 'WEBP') {
        return webpBuffer;
    }

    const exifData = createExif(pack, author);
    const exifChunk = Buffer.alloc(8 + exifData.length + (exifData.length % 2));
    exifChunk.write('EXIF', 0);
    exifChunk.writeUInt32LE(exifData.length, 4);
    exifData.copy(exifChunk, 8);

    let offset = 12;
    let hasVp8x = false;
    const chunks = [];

    while (offset < webpBuffer.length) {
        if (offset + 8 > webpBuffer.length) break;
        const fourcc = webpBuffer.slice(offset, offset + 4).toString();
        const size = webpBuffer.readUInt32LE(offset + 4);
        const chunkSize = 8 + size + (size % 2);

        if (fourcc === 'EXIF') {
            offset += chunkSize;
            continue;
        }

        if (fourcc === 'VP8X') {
            hasVp8x = true;
        }

        chunks.push({
            fourcc,
            data: webpBuffer.slice(offset, offset + chunkSize)
        });
        offset += chunkSize;
    }

    const finalChunks = [];
    if (hasVp8x) {
        for (const chunk of chunks) {
            if (chunk.fourcc === 'VP8X') {
                const chunkCopy = Buffer.from(chunk.data);
                chunkCopy[8] |= 0x08; // Activar bit de EXIF
                finalChunks.push(chunkCopy);
            } else {
                finalChunks.push(chunk.data);
            }
        }
        finalChunks.push(exifChunk);
    } else {
        const vp8xChunk = Buffer.alloc(18);
        vp8xChunk.write('VP8X', 0);
        vp8xChunk.writeUInt32LE(10, 4);
        vp8xChunk[8] = 0x08;
        vp8xChunk.writeUIntLE(511, 12, 3);
        vp8xChunk.writeUIntLE(511, 15, 3);
        finalChunks.push(vp8xChunk);
        for (const chunk of chunks) {
            finalChunks.push(chunk.data);
        }
        finalChunks.push(exifChunk);
    }

    const payload = Buffer.concat(finalChunks);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0);
    header.writeUInt32LE(payload.length + 4, 4);
    header.write('WEBP', 8);

    return Buffer.concat([header, payload]);
}

// --- EXTRACTOR UNIVERSAL DE MULTIMEDIA (QUOTED, DIRECT, VIEW-ONCE, DOCUMENTOS) ---
function resolveMediaTarget(msg, quoted, getMediaInfo) {
    const unwrap = (obj) => {
        if (!obj) return null;
        return obj.viewOnceMessageV2?.message 
            || obj.viewOnceMessage?.message 
            || obj.viewOnceMessageV2Extension?.message 
            || obj;
    };

    // 1. Mensaje citado
    if (quoted) {
        const unwrapped = unwrap(quoted);
        if (getMediaInfo) {
            const info = getMediaInfo(unwrapped);
            if (info) return { ...info, unwrapped };
        }
        if (unwrapped.videoMessage) return { type: 'video', msg: unwrapped.videoMessage, ext: 'mp4', unwrapped };
        if (unwrapped.imageMessage) return { type: 'image', msg: unwrapped.imageMessage, ext: 'jpg', unwrapped };
        if (unwrapped.stickerMessage) return { type: 'sticker', msg: unwrapped.stickerMessage, ext: 'webp', unwrapped };
        if (unwrapped.documentMessage) {
            const mime = (unwrapped.documentMessage.mimetype || '').toLowerCase();
            if (mime.includes('gif')) return { type: 'video', msg: unwrapped.documentMessage, ext: 'gif', unwrapped };
            if (mime.includes('webp')) return { type: 'sticker', msg: unwrapped.documentMessage, ext: 'webp', unwrapped };
            if (mime.startsWith('image/')) return { type: 'image', msg: unwrapped.documentMessage, ext: 'jpg', unwrapped };
            if (mime.startsWith('video/')) return { type: 'video', msg: unwrapped.documentMessage, ext: 'mp4', unwrapped };
        }
    }

    // 2. Mensaje directo (con comentario)
    if (msg && msg.message) {
        const unwrapped = unwrap(msg.message);
        if (getMediaInfo) {
            const info = getMediaInfo(unwrapped);
            if (info) return { ...info, unwrapped };
        }
        if (unwrapped.videoMessage) return { type: 'video', msg: unwrapped.videoMessage, ext: 'mp4', unwrapped };
        if (unwrapped.imageMessage) return { type: 'image', msg: unwrapped.imageMessage, ext: 'jpg', unwrapped };
        if (unwrapped.stickerMessage) return { type: 'sticker', msg: unwrapped.stickerMessage, ext: 'webp', unwrapped };
        if (unwrapped.documentMessage) {
            const mime = (unwrapped.documentMessage.mimetype || '').toLowerCase();
            if (mime.includes('gif')) return { type: 'video', msg: unwrapped.documentMessage, ext: 'gif', unwrapped };
            if (mime.includes('webp')) return { type: 'sticker', msg: unwrapped.documentMessage, ext: 'webp', unwrapped };
            if (mime.startsWith('image/')) return { type: 'image', msg: unwrapped.documentMessage, ext: 'jpg', unwrapped };
            if (mime.startsWith('video/')) return { type: 'video', msg: unwrapped.documentMessage, ext: 'mp4', unwrapped };
        }
    }

    return null;
}

module.exports = {
    name: 'sticker',
    match: (text) => /^\.(s|sticker)(\s+.*)?$/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, quoted, textoLimpio, getMediaInfo, downloadContentFromMessage }) => {
        const mediaTarget = resolveMediaTarget(msg, quoted, getMediaInfo);

        if (!mediaTarget || !['image', 'video', 'sticker'].includes(mediaTarget.type)) {
            return sock.sendMessage(remitente, { 
                text: "⚠️ Responde a una imagen, video o GIF con *.s*, o envía el archivo con *.s* de comentario." 
            }, { quoted: msg });
        }

        // Configuración de Pack y Autor (Soporta .s Mi Pack | Mi Autor)
        let packName = process.env.STICKER_PACK || 'WeBot';
        let authorName = process.env.STICKER_AUTHOR || 'Agostini';

        const customInput = (textoLimpio || '').replace(/^\.(s|sticker)\s*/i, '').trim();
        if (customInput) {
            if (customInput.includes('|')) {
                const parts = customInput.split('|');
                packName = parts[0].trim() || packName;
                authorName = parts.slice(1).join('|').trim() || authorName;
            } else {
                packName = customInput;
            }
        }

        const isVideo = mediaTarget.type === 'video';
        let statusMsg = await sock.sendMessage(remitente, { 
            text: isVideo ? "⏳ Procesando sticker animado..." : "⏳ Creando sticker..." 
        }, { quoted: msg });

        const idStr = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const inputPath = path.join(os.tmpdir(), `temp_stk_in_${idStr}.${mediaTarget.ext || 'bin'}`);
        const outputPath = path.join(os.tmpdir(), `temp_stk_out_${idStr}.webp`);

        try {
            // Descarga de multimedia
            const stream = await downloadContentFromMessage(mediaTarget.msg, mediaTarget.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer.length) {
                throw new Error("No se pudo descargar el archivo multimedia.");
            }

            // CASO ESPECIAL: Si ya es un sticker, le inyectamos los metadatos directamente
            if (mediaTarget.type === 'sticker') {
                const isAnimatedSticker = Boolean(
                    mediaTarget.msg?.isAnimated ||
                    buffer.includes(Buffer.from('ANIM')) ||
                    buffer.includes(Buffer.from('ANMF'))
                );
                const finalBuffer = addExifToWebp(buffer, packName, authorName);
                await sock.sendMessage(remitente, { 
                    sticker: finalBuffer, 
                    isAnimated: isAnimatedSticker 
                }, { quoted: msg });

                await sock.sendMessage(remitente, { delete: statusMsg.key }).catch(() => {});
                return;
            }

            // Para imágenes y videos requerimos FFmpeg
            const ffmpegStatus = ensureFfmpegAvailable();
            if (!ffmpegStatus.ok) {
                return sock.sendMessage(remitente, { text: `❌ ${ffmpegStatus.message}` });
            }

            fs.writeFileSync(inputPath, buffer);

            if (isVideo) {
                // STICKER ANIMADO (VIDEO / GIF)
                // Duración máxima recomendada: 6-7 segundos para garantizar estabilidad y fluidez
                const maxSeconds = Math.min(Number(process.env.STICKER_MAX_SECONDS || 7), 7);
                
                // Filtro: Escala proporcional a 512x512 con padding transparente centrado y 12 fps
                const filterChain = "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1,fps=12";
                
                const args = [
                    '-y',
                    '-i', inputPath,
                    '-t', String(maxSeconds),
                    '-vf', filterChain,
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-lossless', '0',
                    '-compression_level', '4',
                    '-q:v', '45',
                    '-an',
                    outputPath
                ];

                await execFilePromise(ffmpegStatus.ffmpegPath, args);

                // Salvaguarda: Límite estricto de WhatsApp para stickers animados (< 1 MB)
                // Si excede 920 KB, realizamos una pasada de compresión adicional
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 920 * 1024) {
                    const fallbackArgs = [
                        '-y',
                        '-i', inputPath,
                        '-t', '5',
                        '-vf', "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1,fps=10",
                        '-vcodec', 'libwebp',
                        '-loop', '0',
                        '-lossless', '0',
                        '-compression_level', '6',
                        '-q:v', '25',
                        '-an',
                        outputPath
                    ];
                    await execFilePromise(ffmpegStatus.ffmpegPath, fallbackArgs);
                }

            } else {
                // STICKER ESTÁTICO (IMAGEN)
                const filterChainStatic = "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1";
                const argsStatic = [
                    '-y',
                    '-i', inputPath,
                    '-vf', filterChainStatic,
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-compression_level', '4',
                    '-q:v', '75',
                    '-an',
                    outputPath
                ];

                await execFilePromise(ffmpegStatus.ffmpegPath, argsStatic);
            }

            if (!fs.existsSync(outputPath)) {
                throw new Error("FFmpeg no generó el archivo de salida.");
            }

            // Lectura e inyección de metadatos EXIF
            let webpBuffer = fs.readFileSync(outputPath);
            webpBuffer = addExifToWebp(webpBuffer, packName, authorName);

            // Envío con el flag crítico isAnimated para stickers de video/gif
            await sock.sendMessage(remitente, { 
                sticker: webpBuffer, 
                isAnimated: isVideo 
            }, { quoted: msg });

            // Eliminar mensaje de espera
            await sock.sendMessage(remitente, { delete: statusMsg.key }).catch(() => {});

        } catch (err) {
            console.error("Error en plugin sticker:", err);
            await sock.sendMessage(remitente, { 
                text: `❌ Error al procesar el sticker: ${(err.message || '').substring(0, 150)}` 
            }, { quoted: msg });
        } finally {
            // Limpieza estricta de archivos temporales
            if (fs.existsSync(inputPath)) {
                try { fs.unlinkSync(inputPath); } catch (e) {}
            }
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) {}
            }
        }
    }
};
