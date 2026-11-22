const QRCode = require('qrcode');
const pino = require('pino');
const pool = require('../config/db');

let baileysPromise = null;
function cargarBaileys() {
    if (!baileysPromise) {
        baileysPromise = import('@whiskeysockets/baileys');
    }
    return baileysPromise;
}

/**
 * Normaliza un número telefónico a formato internacional solo dígitos (ej: 51987654321).
 */
function normalizarNumeroWhatsApp(telefono) {
    if (!telefono) return '';
    let digitos = String(telefono).replace(/\D/g, '');
    if (!digitos) return '';
    if (digitos.startsWith('00')) {
        digitos = digitos.slice(2);
    }
    if (digitos.length === 9 && digitos.startsWith('9')) {
        digitos = `51${digitos}`;
    }
    if (digitos.length < 7) return '';
    return digitos;
}

/**
 * AuthStore en PostgreSQL compatible con Baileys 7 (`BufferJSON` + batch queries).
 */
async function crearAuthStatePostgres(baileys) {
    const { BufferJSON, initAuthCreds, proto } = baileys;
    let colaEscritura = Promise.resolve();

    const encolar = (fn) => {
        const next = colaEscritura.then(fn, fn);
        colaEscritura = next.catch(() => {});
        return next;
    };

    const leerClave = async (clave) => {
        const { rows } = await pool.query(
            'SELECT datos FROM whatsapp_auth_state WHERE clave = $1::varchar LIMIT 1;',
            [clave]
        );
        if (!rows[0]) return null;
        return JSON.parse(rows[0].datos, BufferJSON.reviver);
    };

    const guardarClave = (clave, valor) => encolar(async () => {
        const serializado = JSON.stringify(valor, BufferJSON.replacer);
        await pool.query(
            `INSERT INTO whatsapp_auth_state (clave, datos, actualizado_en)
             VALUES ($1::varchar, $2::text, CURRENT_TIMESTAMP)
             ON CONFLICT (clave)
             DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = CURRENT_TIMESTAMP;`,
            [clave, serializado]
        );
    });

    const creds = (await leerClave('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    if (!Array.isArray(ids) || ids.length === 0) return data;
                    const claves = ids.map((id) => `${type}:${id}`);
                    const { rows } = await pool.query(
                        'SELECT clave, datos FROM whatsapp_auth_state WHERE clave = ANY($1::varchar[]);',
                        [claves]
                    );
                    const mapa = new Map(rows.map((r) => [r.clave, r.datos]));
                    for (const id of ids) {
                        const raw = mapa.get(`${type}:${id}`);
                        let value = raw ? JSON.parse(raw, BufferJSON.reviver) : null;
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    const clavesUpsert = [];
                    const datosUpsert = [];
                    const clavesDelete = [];

                    for (const category of Object.keys(data || {})) {
                        const grupo = data[category] || {};
                        for (const id of Object.keys(grupo)) {
                            const valor = grupo[id];
                            const clave = `${category}:${id}`;
                            if (valor) {
                                clavesUpsert.push(clave);
                                datosUpsert.push(JSON.stringify(valor, BufferJSON.replacer));
                            } else {
                                clavesDelete.push(clave);
                            }
                        }
                    }

                    if (clavesUpsert.length === 0 && clavesDelete.length === 0) return;

                    await encolar(async () => {
                        if (clavesUpsert.length > 0) {
                            await pool.query(
                                `INSERT INTO whatsapp_auth_state (clave, datos, actualizado_en)
                                 SELECT c, d, CURRENT_TIMESTAMP
                                 FROM UNNEST($1::varchar[], $2::text[]) AS t(c, d)
                                 ON CONFLICT (clave)
                                 DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = CURRENT_TIMESTAMP;`,
                                [clavesUpsert, datosUpsert]
                            );
                        }
                        if (clavesDelete.length > 0) {
                            await pool.query(
                                'DELETE FROM whatsapp_auth_state WHERE clave = ANY($1::varchar[]);',
                                [clavesDelete]
                            );
                        }
                    });
                }
            }
        },
        saveCreds: async () => {
            await guardarClave('creds', creds);
        }
    };
}

let sockActual = null;
let estadoConexion = 'DESCONECTADO'; // 'DESCONECTADO' | 'INICIANDO' | 'ESPERANDO_QR' | 'CONECTADO' | 'ERROR'
let qrDataUrlActual = null;
let qrActualizadoEn = null;
let numeroConectadoActual = '';
let nombreConectadoActual = '';
let ultimoErrorActual = '';
let timerReconexion = null;
let intentosReconexion = 0;
let intentosQrSinRegistro = 0;
let promesaConexionActiva = null;
let cierreIntencional = false;
let epochSocket = 0;

function limpiarTimerReconexion() {
    if (timerReconexion) {
        clearTimeout(timerReconexion);
        timerReconexion = null;
    }
}

function extraerNumeroDeUserId(userId = '') {
    const antesArroba = String(userId || '').split('@')[0] || '';
    return antesArroba.split(':')[0].replace(/\D/g, '');
}

async function limpiarSesionEnBD() {
    await pool.query('DELETE FROM whatsapp_auth_state;');
}

function cerrarSocketActualSilencioso() {
    limpiarTimerReconexion();
    epochSocket += 1;
    const sock = sockActual;
    sockActual = null;
    if (sock) {
        try {
            sock.ev.removeAllListeners();
        } catch {
            // ignorar
        }
        try {
            sock.end(new Error('Reinicio controlado de sesión'));
        } catch {
            // ignorar
        }
    }
}

async function iniciarConexionWhatsApp({ reiniciarSesion = false } = {}) {
    if (promesaConexionActiva && !reiniciarSesion) {
        return promesaConexionActiva;
    }

    const ejecutar = async () => {
        cierreIntencional = false;
        cerrarSocketActualSilencioso();
        const miEpoch = epochSocket;

        if (reiniciarSesion) {
            await limpiarSesionEnBD();
            intentosQrSinRegistro = 0;
            intentosReconexion = 0;
        }

        estadoConexion = 'INICIANDO';
        qrDataUrlActual = null;
        qrActualizadoEn = null;
        ultimoErrorActual = '';

        try {
            const baileys = await cargarBaileys();
            const makeWASocket = baileys.makeWASocket || baileys.default;
            const { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = baileys;

            const { state, saveCreds } = await crearAuthStatePostgres(baileys);
            const loggerSilencioso = pino({ level: 'silent' });

            let versionOption;
            try {
                const vRes = await fetchLatestBaileysVersion();
                if (vRes?.version) versionOption = vRes.version;
            } catch {
                // usar versión por defecto embebida en Baileys
            }

            if (miEpoch !== epochSocket) return;

            const sock = makeWASocket({
                ...(versionOption ? { version: versionOption } : {}),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, loggerSilencioso)
                },
                logger: loggerSilencioso,
                browser: Browsers.ubuntu('Mi ERP Stock'),
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                connectTimeoutMs: 25000
            });

            sockActual = sock;

            sock.ev.on('creds.update', async () => {
                if (miEpoch !== epochSocket) return;
                try {
                    await saveCreds();
                } catch (err) {
                    console.error('Error guardando credenciales de WhatsApp:', err?.message || err);
                }
            });

            sock.ev.on('connection.update', async (update) => {
                if (miEpoch !== epochSocket) return;

                const { connection, lastDisconnect, qr } = update || {};

                if (qr) {
                    try {
                        qrDataUrlActual = await QRCode.toDataURL(qr, {
                            width: 280,
                            margin: 2
                        });
                        qrActualizadoEn = new Date().toISOString();
                        estadoConexion = 'ESPERANDO_QR';
                        intentosQrSinRegistro += 1;
                    } catch (qrErr) {
                        console.error('Error generando imagen QR WhatsApp:', qrErr?.message || qrErr);
                    }
                }

                if (connection === 'open') {
                    estadoConexion = 'CONECTADO';
                    qrDataUrlActual = null;
                    qrActualizadoEn = null;
                    ultimoErrorActual = '';
                    intentosReconexion = 0;
                    intentosQrSinRegistro = 0;
                    numeroConectadoActual = extraerNumeroDeUserId(sock.user?.id || state.creds?.me?.id);
                    nombreConectadoActual = sock.user?.name || state.creds?.me?.name || '';
                    console.log(`✅ WhatsApp Empresa conectado (+${numeroConectadoActual || 'sin número'}).`);
                }

                if (connection === 'close') {
                    if (sockActual === sock) {
                        sockActual = null;
                    }
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const errMsg = lastDisconnect?.error?.message || '';
                    const estaRegistrado = Boolean(state.creds?.registered);

                    if (cierreIntencional) {
                        estadoConexion = 'DESCONECTADO';
                        qrDataUrlActual = null;
                        numeroConectadoActual = '';
                        nombreConectadoActual = '';
                        return;
                    }

                    const esLogout =
                        statusCode === DisconnectReason.loggedOut ||
                        statusCode === DisconnectReason.badSession;

                    if (esLogout) {
                        console.warn('⚠️ Sesión de WhatsApp cerrada o inválida. Limpiando credenciales...');
                        await limpiarSesionEnBD().catch(() => {});
                        estadoConexion = 'DESCONECTADO';
                        qrDataUrlActual = null;
                        qrActualizadoEn = null;
                        numeroConectadoActual = '';
                        nombreConectadoActual = '';
                        ultimoErrorActual = 'La sesión de WhatsApp fue cerrada desde el teléfono. Escanea el código QR nuevamente.';
                        return;
                    }

                    if (statusCode === DisconnectReason.restartRequired) {
                        // Tras escanear QR, WhatsApp exige reinicio limpio del socket (515)
                        limpiarTimerReconexion();
                        timerReconexion = setTimeout(() => {
                            timerReconexion = null;
                            iniciarConexionWhatsApp({ reiniciarSesion: false }).catch((err) => {
                                console.error('Error en reinicio requerido WhatsApp:', err?.message || err);
                            });
                        }, 800);
                        return;
                    }

                    const qrExpiradoSinEscaneo =
                        !estaRegistrado &&
                        (intentosQrSinRegistro >= 4 || errMsg.toLowerCase().includes('qr refs attempts ended'));

                    if (qrExpiradoSinEscaneo) {
                        estadoConexion = 'DESCONECTADO';
                        qrDataUrlActual = null;
                        qrActualizadoEn = null;
                        ultimoErrorActual = 'El código QR venció sin escanearse. Presiona "Vincular WhatsApp (QR)" para generar uno nuevo.';
                        return;
                    }

                    intentosReconexion += 1;
                    const delayMs = Math.min(30000, 2000 * Math.pow(2, Math.min(intentosReconexion - 1, 4)));
                    estadoConexion = 'INICIANDO';
                    ultimoErrorActual = `Reconectando con WhatsApp (${errMsg || `código ${statusCode || 'desconocido'}`})...`;

                    limpiarTimerReconexion();
                    timerReconexion = setTimeout(() => {
                        timerReconexion = null;
                        iniciarConexionWhatsApp({ reiniciarSesion: false }).catch((err) => {
                            console.error('Error reconectando WhatsApp:', err?.message || err);
                        });
                    }, delayMs);
                }
            });
        } catch (err) {
            console.error('Error iniciando servicio de WhatsApp:', err?.message || err);
            estadoConexion = 'ERROR';
            ultimoErrorActual = err?.message || 'No se pudo iniciar la conexión con WhatsApp.';
        }
    };

    promesaConexionActiva = ejecutar().finally(() => {
        promesaConexionActiva = null;
    });
    return promesaConexionActiva;
}

async function iniciarWhatsAppSiTieneSesion() {
    try {
        const { rows } = await pool.query(
            "SELECT 1 FROM whatsapp_auth_state WHERE clave = 'creds' LIMIT 1;"
        );
        if (rows.length > 0) {
            console.log('📱 Sesión previa de WhatsApp detectada; restaurando conexión en segundo plano...');
            iniciarConexionWhatsApp({ reiniciarSesion: false }).catch((err) => {
                console.error('Error restaurando sesión de WhatsApp:', err?.message || err);
            });
        }
    } catch (err) {
        console.warn('No se pudo verificar sesión previa de WhatsApp al iniciar:', err?.message || err);
    }
}

async function vincularWhatsApp({ forzarNuevoQr = false } = {}) {
    if (estadoConexion === 'CONECTADO' && sockActual && !forzarNuevoQr) {
        return obtenerEstadoWhatsApp(true);
    }
    if (estadoConexion === 'ESPERANDO_QR' && qrDataUrlActual && !forzarNuevoQr) {
        return obtenerEstadoWhatsApp(true);
    }

    const { rows } = await pool.query(
        "SELECT datos FROM whatsapp_auth_state WHERE clave = 'creds' LIMIT 1;"
    );
    let registrado = false;
    if (rows[0]?.datos) {
        try {
            const baileys = await cargarBaileys();
            const creds = JSON.parse(rows[0].datos, baileys.BufferJSON.reviver);
            registrado = Boolean(creds?.registered);
        } catch {
            registrado = false;
        }
    }

    const debeResetear = forzarNuevoQr || !registrado;
    await iniciarConexionWhatsApp({ reiniciarSesion: debeResetear });

    // Esperar hasta ~5s para entregar inmediatamente el primer QR o conexión en la misma respuesta HTTP
    const inicio = Date.now();
    while (
        Date.now() - inicio < 5000 &&
        !qrDataUrlActual &&
        estadoConexion !== 'CONECTADO' &&
        estadoConexion !== 'ERROR' &&
        estadoConexion !== 'DESCONECTADO'
    ) {
        await new Promise((r) => setTimeout(r, 250));
    }

    return obtenerEstadoWhatsApp(true);
}

async function desconectarWhatsApp() {
    cierreIntencional = true;
    const sock = sockActual;
    cerrarSocketActualSilencioso();
    if (sock) {
        try {
            await Promise.race([
                sock.logout().catch(() => {}),
                new Promise((r) => setTimeout(r, 3000))
            ]);
        } catch {
            // ignorar
        }
    }
    await limpiarSesionEnBD().catch(() => {});
    estadoConexion = 'DESCONECTADO';
    qrDataUrlActual = null;
    qrActualizadoEn = null;
    numeroConectadoActual = '';
    nombreConectadoActual = '';
    ultimoErrorActual = '';
    intentosReconexion = 0;
    intentosQrSinRegistro = 0;
    return obtenerEstadoWhatsApp(true);
}

function obtenerEstadoWhatsApp(incluirQr = false) {
    return {
        estado: estadoConexion,
        conectado: estadoConexion === 'CONECTADO' && Boolean(sockActual),
        numero: numeroConectadoActual || '',
        nombre: nombreConectadoActual || '',
        ultimo_error: ultimoErrorActual || '',
        qr_actualizado_en: qrActualizadoEn || null,
        ...(incluirQr ? { qr_data_url: qrDataUrlActual || null } : {})
    };
}

async function enviarMensajeWhatsApp(telefonoDestino, texto) {
    const numero = normalizarNumeroWhatsApp(telefonoDestino);
    if (!numero) {
        return {
            enviado: false,
            codigo: 'NUMERO_INVALIDO',
            mensaje: 'El número de WhatsApp del destinatario no es válido. Verifícalo en Personal y Roles.'
        };
    }

    if (estadoConexion !== 'CONECTADO' || !sockActual) {
        return {
            enviado: false,
            codigo: 'WHATSAPP_NO_CONECTADO',
            mensaje: 'WhatsApp empresa no está conectado. Pide al Admin Central vincular el código QR en Mensajes.'
        };
    }

    const candidateJid = `${numero}@s.whatsapp.net`;
    let jidFinal = candidateJid;

    try {
        const verificacion = await sockActual.onWhatsApp(candidateJid);
        const primero = Array.isArray(verificacion) ? verificacion[0] : null;
        if (primero && primero.exists === false) {
            return {
                enviado: false,
                codigo: 'NUMERO_SIN_WHATSAPP',
                mensaje: `El número ${telefonoDestino} no tiene una cuenta activa en WhatsApp.`
            };
        }
        if (primero?.jid) {
            jidFinal = primero.jid;
        }
    } catch (checkErr) {
        console.warn('Advertencia al verificar JID en WhatsApp:', checkErr?.message || checkErr);
    }

    try {
        await sockActual.sendMessage(jidFinal, { text: String(texto || '').trim() });
        return {
            enviado: true,
            numero,
            jid: jidFinal
        };
    } catch (sendErr) {
        console.error('Error enviando mensaje por WhatsApp:', sendErr?.message || sendErr);
        return {
            enviado: false,
            codigo: 'ERROR_ENVIO_WHATSAPP',
            mensaje: `No se pudo entregar el mensaje por WhatsApp (${sendErr?.message || 'error de conexión'}).`
        };
    }
}

module.exports = {
    normalizarNumeroWhatsApp,
    iniciarWhatsAppSiTieneSesion,
    vincularWhatsApp,
    desconectarWhatsApp,
    obtenerEstadoWhatsApp,
    enviarMensajeWhatsApp
};
