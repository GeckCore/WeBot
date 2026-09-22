const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function commandExists(command) {
    try {
        const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
        return !result.error && result.status === 0;
    } catch (e) {
        return false;
    }
}

function resolveFfmpegPath() {
    const candidates = [
        process.env.FFMPEG_PATH,
        path.join(process.cwd(), 'ffmpeg'),
        'ffmpeg'
    ].filter(Boolean);

    for (const candidate of candidates) {
        const isPathLike = candidate.includes('/') || candidate.includes('\\') || candidate.startsWith('.');
        if (isPathLike) {
            const absolute = path.resolve(candidate);
            if (fs.existsSync(absolute)) return absolute;
            continue;
        }
        if (commandExists(candidate)) return candidate;
    }

    return null;
}

function ensureFfmpegAvailable() {
    const ffmpegPath = resolveFfmpegPath();
    if (ffmpegPath) {
        return { ok: true, ffmpegPath };
    }

    return {
        ok: false,
        message: 'FFmpeg no está disponible. Configura FFMPEG_PATH o instala un buildpack de FFmpeg en Heroku.'
    };
}

module.exports = {
    resolveFfmpegPath,
    ensureFfmpegAvailable
};
