function normalizeWhatsAppId(value) {
    if (!value) return '';
    return String(value)
        .trim()
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');
}

function extractSenderJid(msg, fallbackJid = '') {
    if (msg?.key?.fromMe && fallbackJid) return fallbackJid;
    return msg?.key?.participant || msg?.key?.remoteJid || fallbackJid || '';
}

function resolveOwnerId(fallbackJid = '') {
    const rawOwner = process.env.OWNER_NUMBER || process.env.OWNER_JID || process.env.OWNER || '';
    const ownerId = normalizeWhatsAppId(rawOwner || fallbackJid);
    return ownerId;
}

function isOwnerSender(senderJid, ownerId) {
    const sender = normalizeWhatsAppId(senderJid);
    const owner = normalizeWhatsAppId(ownerId);
    return Boolean(sender && owner && sender === owner);
}

module.exports = {
    normalizeWhatsAppId,
    extractSenderJid,
    resolveOwnerId,
    isOwnerSender
};
