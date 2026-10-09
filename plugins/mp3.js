const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const { ensureFfmpegAvailable } = require('../src/utils/ffmpeg');

// --- EXTRACTOR UNIVERSAL DE MULTIMEDIA (QUOTED, DIRECT, VIEW-ONCE, DOCUMENTOS, EPHEMERAL) ---
function resolveMediaTarget(msg, quoted, getMediaInfo) {
    const unwrap = (obj) => {
        if (!obj) return null;
        let target = obj;
        if (target.ephemeralMessage?.message) target = target.ephemeralMessage.message;
        if (target.viewOnceMessage?.message) target = target.viewOnceMessage.message;
        if (target.viewOnceMessageV2?.message) target = target.viewOnceMessageV2.message;
        if (target.viewOnceMessageV2Extension?.message) target = target.viewOnceMessageV2Extension.message;
        if (target.documentWithCaptionMessage?.message) target = target.documentWithCaptionMessage.message;
        return target;
    };

    const extract = (unwrapped) => {
        if (!unwrapped) return null;

        // 1. Detección directa por campos de Baileys
        if (unwrapped.videoMessage) {
            return {
                type: 'video',
                msg: unwrapped.videoMessage,
                ext: 'mp4',
                originalName: unwrapped.videoMessage?.fileName,
                seconds: unwrapped.videoMessage?.seconds
            };
        }

        if (unwrapped.audioMessage) {
            return {
                type: 'audio',
                msg: unwrapped.audioMessage,
                ext: 'ogg',
                originalName: unwrapped.audioMessage?.fileName,
                seconds: unwrapped.audioMessage?.seconds
            };
        }

        if (unwrapped.documentMessage) {
            const doc = unwrapped.documentMessage;
            const mime = (doc.mimetype || '').toLowerCase();
            const fn = (doc.fileName || '').toLowerCase();
            const isAudio = mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|aac|opus|flac|wma)$/i.test(fn);
            const isVideo = mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|flv|webm|3gp)$/i.test(fn);

            if (isAudio || isVideo) {
                return {
                    type: 'document',
                    msg: doc,
                    ext: isVideo ? 'mp4' : 'ogg',
                    originalName: doc.fileName,
                    isVideo,
                    isAudio
                };
            }
        }

        // 2. Fallback a getMediaInfo de index.js
        if (getMediaInfo) {
            const info = getMediaInfo(unwrapped);
            if (info) {
                if (info.type === 'video') return { type: 'video', msg: info.msg, ext: 'mp4', originalName: info.msg?.fileName };
                if (info.type === 'audio') return { type: 'audio', msg: info.msg, ext: 'ogg', originalName: info.msg?.fileName };
                if (info.type === 'document') {
                    const doc = info.msg;
                    const mime = (doc?.mimetype || '').toLowerCase();
                    const fn = (doc?.fileName || '').toLowerCase();
                    const isAudio = mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|aac|opus|flac|wma)$/i.test(fn);
                    const isVideo = mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|flv|webm|3gp)$/i.test(fn);
                    if (isAudio || isVideo) {
                        return {
                            type: 'document',
                            msg: doc,
                            ext: isVideo ? 'mp4' : 'ogg',
                            originalName: doc?.fileName,
                            isVideo,
                            isAudio
                        };
                    }
                }
                if (info.type === 'image' || info.type === 'sticker') {
                    return { type: 'unsupported', reason: 'image_or_sticker' };
                }
            }
        }

        if (unwrapped.imageMessage || unwrapped.stickerMessage) {
            return { type: 'unsupported', reason: 'image_or_sticker' };
        }

        return null;
    };

    if (quoted) {
        const res = extract(unwrap(quoted));
        if (res) return { ...res, source: 'quoted' };
    }

    if (msg?.message) {
        const res = extract(unwrap(msg.message));
        if (res) return { ...res, source: 'direct' };
    }

    return null;
}

module.exports = {
    name: 'media_to_mp3',
    match: (text) => /^\.(mp3|tomp3|audio|vn|tovn)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, quoted, textoLimpio, getMediaInfo, downloadContentFromMessage }) => {
        const mediaTarget = resolveMediaTarget(msg, quoted, getMediaInfo);

        if (!mediaTarget) {
            return sock.sendMessage(remitente, {
                text: "⚠️ *GECKCORE // CONVERSOR A MP3*\nResponde a un video, nota de voz o archivo multimedia con *.mp3*, o envía el archivo con *.mp3* de comentario.\n\n📌 *Opciones:* `.mp3 [nombre]` o `.mp3 --vn` (para nota de voz)."
            }, { quoted: msg });
        }

        if (mediaTarget.type === 'unsupported') {
            return sock.sendMessage(remitente, {
                text: "⚠️ Las imágenes o stickers no contienen pista de audio. Responde a un video, nota de voz o archivo multimedia."
            }, { quoted: msg });
        }

        // Sigilo: Si fue respondiendo a un mensaje, borramos el comando disparador
        if (quoted && msg?.key) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
        }

        // Determinar destino de cita (si citó, citar el mensaje multimedia original)
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        let quoteTarget = msg;
        if (contextInfo?.stanzaId) {
            quoteTarget = {
                key: {
                    remoteJid: remitente,
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                },
                message: contextInfo.quotedMessage
            };
        }

        // Analizar argumentos y banderas
        const cmdMatch = (textoLimpio || '').match(/^\.(mp3|tomp3|audio|vn|tovn)(?:\s+(.*))?$/i);
        const cmdName = (cmdMatch?.[1] || 'mp3').toLowerCase();
        const cmdArgs = (cmdMatch?.[2] || '').trim();

        const isVnCommand = /^(vn|tovn)$/i.test(cmdName);
        const hasVnFlag = /(--vn|--ptt|\bvn\b|\bptt\b)/i.test(cmdArgs);
        const asVoiceNote = isVnCommand || hasVnFlag;

        let customName = cmdArgs
            .replace(/(--vn|--ptt|\bvn\b|\bptt\b)/gi, '')
            .trim();

        let baseFileName = 'audio';
        if (customName) {
            baseFileName = customName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 50).trim();
        } else if (mediaTarget.originalName) {
            baseFileName = path.basename(mediaTarget.originalName, path.extname(mediaTarget.originalName));
            baseFileName = baseFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 50).trim();
        }
        if (!baseFileName) baseFileName = 'audio';

        // Verificar disponibilidad de FFmpeg
        const ffmpegStatus = ensureFfmpegAvailable();
        if (!ffmpegStatus.ok) {
            return sock.sendMessage(remitente, { text: `❌ ${ffmpegStatus.message}` }, { quoted: quoteTarget });
        }

        const idStr = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const tempIn = path.join(os.tmpdir(), `temp_audio_in_${idStr}.${mediaTarget.ext || 'bin'}`);
        const tempOut = path.join(os.tmpdir(), `temp_audio_out_${idStr}.${asVoiceNote ? 'ogg' : 'mp3'}`);

        try {
            // Descargar stream multimedia
            const downloadType = mediaTarget.type === 'document' ? 'document' : mediaTarget.type;
            const stream = await downloadContentFromMessage(mediaTarget.msg, downloadType);
            let chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            if (!buffer.length) {
                throw new Error("El archivo descargado está vacío.");
            }

            if (buffer.length > 100 * 1024 * 1024) {
                return sock.sendMessage(remitente, { 
                    text: `❌ El archivo es demasiado pesado (${(buffer.length / (1024 * 1024)).toFixed(1)} MB). Límite: 100 MB.` 
                }, { quoted: quoteTarget });
            }

            fs.writeFileSync(tempIn, buffer);

            // Argumentos de conversión FFmpeg
            let ffmpegArgs = [];
            if (asVoiceNote) {
                // Formato Opus PTT (Mono, 48kHz, optimized voice codec)
                ffmpegArgs = [
                    '-y',
                    '-i', tempIn,
                    '-vn',
                    '-c:a', 'libopus',
                    '-b:a', '64k',
                    '-ar', '48000',
                    '-ac', '1',
                    '-application', 'voip',
                    '-avoid_negative_ts', 'make_zero',
                    tempOut
                ];
            } else {
                // Formato MP3 nativo para reproducción directa en chat
                ffmpegArgs = [
                    '-y',
                    '-i', tempIn,
                    '-vn',
                    '-c:a', 'libmp3lame',
                    '-b:a', '192k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-avoid_negative_ts', 'make_zero',
                    tempOut
                ];
            }

            try {
                await execFilePromise(ffmpegStatus.ffmpegPath, ffmpegArgs, { timeout: 180000 });
            } catch (ffErr) {
                const combinedErr = `${ffErr.message || ''} ${ffErr.stderr || ''}`;
                if (combinedErr.includes('does not contain any stream') || combinedErr.includes('matches no streams')) {
                    return sock.sendMessage(remitente, { 
                        text: "⚠️ El video o archivo no contiene ninguna pista de audio reproducible." 
                    }, { quoted: quoteTarget });
                }
                throw ffErr;
            }

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("FFmpeg no generó el archivo de audio de salida.");
            }

            const outputBuffer = fs.readFileSync(tempOut);

            if (asVoiceNote) {
                await sock.sendMessage(remitente, {
                    audio: outputBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                }, { quoted: quoteTarget });
            } else {
                await sock.sendMessage(remitente, {
                    audio: outputBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${baseFileName}.mp3`,
                    ptt: false
                }, { quoted: quoteTarget });
            }

        } catch (err) {
            console.error('[MP3 CONVERTER ERROR]:', err);
            await sock.sendMessage(remitente, {
                text: `❌ Error al convertir a MP3: ${err.message || 'Fallo desconocido'}`
            }, { quoted: quoteTarget });
        } finally {
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch (e) {}
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (e) {}
        }
    }
};
