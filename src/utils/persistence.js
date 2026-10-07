const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

// ==========================================
// ESQUEMAS PARA MONGODB
// ==========================================
const SessionFileSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    filename: { type: String, required: true },
    data: { type: String, required: true }, // Contenido en texto/Base64
    isBinary: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});
SessionFileSchema.index({ sessionId: 1, filename: 1 }, { unique: true });

const BotDatabaseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
});

let SessionFileModel = null;
let BotDatabaseModel = null;

let isConnected = false;
let syncQueue = new Map();
let syncTimer = null;
let dbSyncTimer = null;

/**
 * Obtiene la URI de MongoDB desde las variables de entorno.
 */
function getMongoUri() {
    return process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL || '';
}

/**
 * Conecta a MongoDB de forma segura si la variable está definida.
 */
async function connectToMongo() {
    const uri = getMongoUri();
    if (!uri) {
        console.log('[PERSISTENCIA] ℹ️ MONGODB_URI no configurado. Operando con disco local (efímero en Heroku).');
        return false;
    }

    try {
        console.log('[PERSISTENCIA] ⏳ Conectando a MongoDB Atlas...');
        if (uri.startsWith('mongodb+srv://')) {
            try { dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); } catch (e) {}
        }
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000
        });

        // Registrar modelos de Mongoose
        SessionFileModel = mongoose.models.SessionFile || mongoose.model('SessionFile', SessionFileSchema);
        BotDatabaseModel = mongoose.models.BotDatabase || mongoose.model('BotDatabase', BotDatabaseSchema);

        isConnected = true;
        console.log('[PERSISTENCIA] ✅ Conexión con MongoDB Atlas establecida con éxito.');
        return true;
    } catch (err) {
        console.error('[PERSISTENCIA] ❌ Error conectando a MongoDB:', err.message);
        console.warn('[PERSISTENCIA] ⚠️ Se continuará con el almacenamiento local.');
        isConnected = false;
        return false;
    }
}

/**
 * Restaura la sesión y la base de datos desde MongoDB antes de que Baileys y LowDB arranquen.
 * @param {string} authFolder - Carpeta local de autenticación (ej: 'auth_info_baileys')
 * @param {string} dbFile - Archivo de base de datos local (ej: 'database.json')
 * @param {string} sessionId - Identificador de sesión (default 'main')
 */
async function restoreFromCloud(authFolder = 'auth_info_baileys', dbFile = 'database.json', sessionId = 'main') {
    const connected = await connectToMongo();
    if (!connected || !SessionFileModel || !BotDatabaseModel) {
        return { restored: false, reason: 'not_connected' };
    }

    const authPath = path.resolve(process.cwd(), authFolder);
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    let filesRestored = 0;
    let dbRestored = false;

    // 1. Restaurar archivos de sesión de WhatsApp
    try {
        const files = await SessionFileModel.find({ sessionId }).lean();
        if (files && files.length > 0) {
            for (const fileDoc of files) {
                const targetFilePath = path.join(authPath, fileDoc.filename);
                const fileBuffer = fileDoc.isBinary 
                    ? Buffer.from(fileDoc.data, 'base64') 
                    : Buffer.from(fileDoc.data, 'utf8');
                fs.writeFileSync(targetFilePath, fileBuffer);
                filesRestored++;
            }
            console.log(`[PERSISTENCIA] ✅ ${filesRestored} archivos de sesión restaurados desde MongoDB.`);
        } else {
            console.log('[PERSISTENCIA] ℹ️ No se encontraron archivos de sesión previos en MongoDB. Se creará una sesión nueva al vincular QR.');
        }
    } catch (err) {
        console.error('[PERSISTENCIA] ❌ Error restaurando sesión desde MongoDB:', err.message);
    }

    // 2. Restaurar base de datos JSON
    try {
        const targetDbPath = path.resolve(process.cwd(), dbFile);
        const dbDoc = await BotDatabaseModel.findOne({ key: 'main_database' }).lean();
        if (dbDoc && dbDoc.data) {
            fs.writeFileSync(targetDbPath, JSON.stringify(dbDoc.data, null, 2), 'utf8');
            dbRestored = true;
            console.log('[PERSISTENCIA] ✅ Base de datos database.json restaurada desde MongoDB.');
        }
    } catch (err) {
        console.error('[PERSISTENCIA] ❌ Error restaurando database.json desde MongoDB:', err.message);
    }

    return { restored: true, filesRestored, dbRestored };
}

/**
 * Guarda un archivo de sesión en MongoDB.
 */
async function persistFileToMongo(authFolder, filename, sessionId = 'main') {
    if (!isConnected || !SessionFileModel) return;

    try {
        const filePath = path.join(process.cwd(), authFolder, filename);
        if (!fs.existsSync(filePath)) {
            // Si el archivo fue borrado localmente, eliminarlo también en MongoDB
            await SessionFileModel.deleteOne({ sessionId, filename });
            return;
        }

        const buffer = fs.readFileSync(filePath);
        // Detectar si es JSON legible o binario
        const isJson = filename.endsWith('.json');
        const data = isJson ? buffer.toString('utf8') : buffer.toString('base64');

        await SessionFileModel.findOneAndUpdate(
            { sessionId, filename },
            { 
                data, 
                isBinary: !isJson, 
                updatedAt: new Date() 
            },
            { upsert: true }
        );
    } catch (err) {
        console.error(`[PERSISTENCIA] Error persistiendo ${filename}:`, err.message);
    }
}

/**
 * Procesa la cola de sincronización de archivos de sesión hacia MongoDB en lotes controlados.
 */
async function processSyncQueue(authFolder, sessionId = 'main') {
    if (syncQueue.size === 0) return;

    const filesToSync = Array.from(syncQueue.keys());
    syncQueue.clear();

    const batchSize = 15;
    for (let i = 0; i < filesToSync.length; i += batchSize) {
        const batch = filesToSync.slice(i, i + batchSize);
        await Promise.all(batch.map(file => persistFileToMongo(authFolder, file, sessionId)));
    }
}

/**
 * Encola un archivo para sincronizar con debounce.
 */
function queueFileSync(authFolder, filename, sessionId = 'main') {
    if (!isConnected) return;
    syncQueue.set(filename, Date.now());

    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        processSyncQueue(authFolder, sessionId).catch(e => {
            console.error('[PERSISTENCIA] Error en cola de sincronización:', e.message);
        });
    }, 2000); // 2 segundos de debounce para agrupar escrituras
}

/**
 * Sincroniza la carpeta de sesión completa hacia MongoDB.
 */
async function syncEntireSession(authFolder = 'auth_info_baileys', sessionId = 'main') {
    if (!isConnected || !SessionFileModel) return;

    const authPath = path.resolve(process.cwd(), authFolder);
    if (!fs.existsSync(authPath)) return;

    try {
        const files = fs.readdirSync(authPath);
        for (const file of files) {
            await persistFileToMongo(authFolder, file, sessionId);
        }
        console.log(`[PERSISTENCIA] ☁️ Sincronizados ${files.length} archivos de sesión con MongoDB.`);
    } catch (err) {
        console.error('[PERSISTENCIA] Error en sincronización completa:', err.message);
    }
}

/**
 * Inicia el observador automático de la carpeta de sesión.
 */
function initSessionWatcher(authFolder = 'auth_info_baileys', sessionId = 'main') {
    if (!isConnected) return;

    const authPath = path.resolve(process.cwd(), authFolder);
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    try {
        fs.watch(authPath, (eventType, filename) => {
            if (filename) {
                queueFileSync(authFolder, filename, sessionId);
            }
        });
        console.log('[PERSISTENCIA] 👁️ Observador de credenciales de sesión activo.');
    } catch (err) {
        console.error('[PERSISTENCIA] No se pudo iniciar fs.watch en sesión:', err.message);
    }
}

/**
 * Sincroniza el estado de la base de datos JSON en MongoDB (con debounce).
 */
function syncDatabase(dbData) {
    if (!isConnected || !BotDatabaseModel || !dbData) return;

    if (dbSyncTimer) clearTimeout(dbSyncTimer);
    dbSyncTimer = setTimeout(async () => {
        try {
            await BotDatabaseModel.findOneAndUpdate(
                { key: 'main_database' },
                { data: dbData, updatedAt: new Date() },
                { upsert: true }
            );
        } catch (err) {
            console.error('[PERSISTENCIA] Error sincronizando database.json a MongoDB:', err.message);
        }
    }, 3000); // 3 segundos de debounce
}

module.exports = {
    getMongoUri,
    connectToMongo,
    restoreFromCloud,
    syncEntireSession,
    initSessionWatcher,
    queueFileSync,
    syncDatabase,
    isPersistenceEnabled: () => isConnected
};
