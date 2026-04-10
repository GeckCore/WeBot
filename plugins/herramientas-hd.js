/**
 * Mejora la imagen: primero intenta APIs externas, si fallan usa sharp local.
 * SIEMPRE convierte el resultado final a JPEG válido con sharp.
 */
async function enhanceImage(buffer) {
    let resultBuffer = null;

    // 1. Intentar APIs externas
    try {
        const url = await uploadToCatbox(buffer);
        resultBuffer = await tryRemoteApis(url);
    } catch (err) {
        console.warn('[HD] APIs remotas fallaron, usando mejora local:', err.message);
    }

    // 2. Si las APIs fallaron o devolvieron basura, usar sharp local
    if (!resultBuffer) {
        resultBuffer = await enhanceWithSharp(buffer);
    }

    // 3. SIEMPRE sanitizar a JPEG válido antes de enviar (evita error de Baileys)
    const finalBuffer = await sharp(resultBuffer)
        .toFormat('jpeg', { quality: 92 })
        .toBuffer();

    return finalBuffer;
}
