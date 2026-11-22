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
 * AuthStore en PostgreSQL particionado por id_usuario (`BufferJSON` + batch queries).
 */
async function crearAuthStatePostgres(baileys, idUsuario) {
    const { BufferJSON, initAuthCreds, proto } = baileys;
    const userId = Number(idUsuario);
    let colaEscritura = Promise.resolve();

    const encolar = (fn) => {
        const next = colaEscritura.then(fn, fn);
        colaEscritura = next.catch(() => {});
        return next;
    };

    const leerClave = async (clave) => {
        const { rows } = await pool.query(
            'SELECT datos FROM whatsapp_auth_state WHERE id_usuario = $1::int AND clave = $2::varchar LIMIT 1;',
            [userId, clave]
        );
        if (!rows[0]) return null;
        return JSON.parse(rows[0].datos, BufferJSON.reviver);
    };

    const guardarClave = (clave, valor) => encolar(async () => {
        const serializado = JSON.stringify(valor, BufferJSON.replacer);
        await pool.query(
            `INSERT INTO whatsapp_auth_state (id_usuario, clave, datos, actualizado_en)
             VALUES ($1::int, $2::varchar, $3::text, CURRENT_TIMESTAMP)
             ON CONFLICT (id_usuario, clave)
             DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = CURRENT_TIMESTAMP;`,
            [userId, clave, serializado]
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
                        'SELECT clave, datos FROM whatsapp_auth_state WHERE id_usuario = $1::int AND clave = ANY($2::varchar[]);',
                        [userId, claves]
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
                                `INSERT INTO whatsapp_auth_state (id_usuario, clave, datos, actualizado_en)
                                 SELECT $1::int, c, d, CURRENT_TIMESTAMP
                                 FROM UNNEST($2::varchar[], $3::text[]) AS t(c, d)
                                 ON CONFLICT (id_usuario, clave)
                                 DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = CURRENT_TIMESTAMP;`,
                                [userId, clavesUpsert, datosUpsert]
                            );
                        }
                        if (clavesDelete.length > 0) {
                            await pool.query(
                                'DELETE FROM whatsapp_auth_state WHERE id_usuario = $1::int AND clave = ANY($2::varchar[]);',
                                [userId, clavesDelete]
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

const sesiones = new Map();

function obtenerOCrearSesion(idUsuario) {
    const key = Number(idUsuario);
    let ses = sesiones.get(key);
    if (!ses) {
        ses = {
            idUsuario: key,
            sockActual: null,
            estadoConexion: 'DESCONECTADO', // 'DESCONECTADO' | 'INICIANDO' | 'ESPERANDO_QR' | 'CONECTADO' | 'ERROR'
            qrDataUrlActual: null,
            qrActualizadoEn: null,
            numeroConectadoActual: '',
            nombreConectadoActual: '',
            ultimoErrorActual: '',
            timerReconexion: null,
            intentosReconexion: 0,
            intentosQrSinRegistro: 0,
            promesaConexionActiva: null,
            cierreIntencional: false,
            epochSocket: 0,
            conectadoDesdeMs: 0
        };
        sesiones.set(key, ses);
    }
    return ses;
}

function limpiarTimerReconexion(ses) {
    if (ses.timerReconexion) {
        clearTimeout(ses.timerReconexion);
        ses.timerReconexion = null;
    }
}

function extraerNumeroDeUserId(userId = '') {
    const antesArroba = String(userId || '').split('@')[0] || '';
    return antesArroba.split(':')[0].replace(/\D/g, '');
}

async function limpiarSesionEnBD(idUsuario) {
    await pool.query('DELETE FROM whatsapp_auth_state WHERE id_usuario = $1::int;', [Number(idUsuario)]);
}

function cerrarSocketSilencioso(ses) {
    limpiarTimerReconexion(ses);
    ses.epochSocket += 1;
    const sock = ses.sockActual;
    ses.sockActual = null;
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

async function iniciarConexionWhatsApp(idUsuario, { reiniciarSesion = false } = {}) {
    const userId = parseInt(idUsuario, 10);
    if (!Number.isFinite(userId)) return;

    const ses = obtenerOCrearSesion(userId);
    if (ses.promesaConexionActiva && !reiniciarSesion) {
        return ses.promesaConexionActiva;
    }

    const ejecutar = async () => {
        ses.cierreIntencional = false;
        cerrarSocketSilencioso(ses);
        const miEpoch = ses.epochSocket;

        if (reiniciarSesion) {
            await limpiarSesionEnBD(userId);
            ses.intentosQrSinRegistro = 0;
            ses.intentosReconexion = 0;
        }

        ses.estadoConexion = 'INICIANDO';
        ses.qrDataUrlActual = null;
        ses.qrActualizadoEn = null;
        ses.ultimoErrorActual = '';

        try {
            const baileys = await cargarBaileys();
            const makeWASocket = baileys.makeWASocket || baileys.default;
            const { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = baileys;

            const { state, saveCreds } = await crearAuthStatePostgres(baileys, userId);
            const loggerSilencioso = pino({ level: 'silent' });

            let versionOption;
            try {
                const vRes = await fetchLatestBaileysVersion();
                if (vRes?.version) versionOption = vRes.version;
            } catch {
                // usar versión por defecto embebida en Baileys
            }

            if (miEpoch !== ses.epochSocket) return;

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

            ses.sockActual = sock;

            sock.ev.on('creds.update', async () => {
                if (miEpoch !== ses.epochSocket) return;
                try {
                    await saveCreds();
                } catch (err) {
                    console.error(`Error guardando credenciales WhatsApp (usuario ${userId}):`, err?.message || err);
                }
            });

            sock.ev.on('connection.update', async (update) => {
                if (miEpoch !== ses.epochSocket) return;

                const { connection, lastDisconnect, qr } = update || {};

                if (qr) {
                    try {
                        ses.qrDataUrlActual = await QRCode.toDataURL(qr, {
                            width: 280,
                            margin: 2
                        });
                        ses.qrActualizadoEn = new Date().toISOString();
                        ses.estadoConexion = 'ESPERANDO_QR';
                        ses.intentosQrSinRegistro += 1;
                    } catch (qrErr) {
                        console.error('Error generando imagen QR WhatsApp:', qrErr?.message || qrErr);
                    }
                }

                if (connection === 'open') {
                    ses.estadoConexion = 'CONECTADO';
                    ses.qrDataUrlActual = null;
                    ses.qrActualizadoEn = null;
                    ses.ultimoErrorActual = '';
                    ses.conectadoDesdeMs = Date.now();
                    ses.intentosQrSinRegistro = 0;
                    ses.numeroConectadoActual = extraerNumeroDeUserId(sock.user?.id || state.creds?.me?.id);
                    ses.nombreConectadoActual = sock.user?.name || state.creds?.me?.name || '';
                    console.log(`✅ WhatsApp conectado para usuario #${userId} (+${ses.numeroConectadoActual || 'sin número'}).`);
                }

                if (connection === 'close') {
                    if (ses.sockActual === sock) {
                        ses.sockActual = null;
                    }
                    if (ses.conectadoDesdeMs && (Date.now() - ses.conectadoDesdeMs) > 15000) {
                        ses.intentosReconexion = 0;
                    }
                    ses.conectadoDesdeMs = 0;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const errMsg = lastDisconnect?.error?.message || '';
                    const estaRegistrado = Boolean(state.creds?.registered || state.creds?.me?.id);
                    console.warn(`ℹ️ WhatsApp usuario #${userId} cerrado (código=${statusCode || 'N/A'}, registrado=${estaRegistrado}): ${errMsg}`);

                    if (ses.cierreIntencional) {
                        ses.estadoConexion = 'DESCONECTADO';
                        ses.qrDataUrlActual = null;
                        ses.numeroConectadoActual = '';
                        ses.nombreConectadoActual = '';
                        return;
                    }

                    const esLogout =
                        statusCode === DisconnectReason.loggedOut ||
                        statusCode === DisconnectReason.badSession;

                    if (esLogout) {
                        console.warn(`⚠️ Sesión de WhatsApp cerrada para usuario #${userId}. Limpiando credenciales...`);
                        await limpiarSesionEnBD(userId).catch(() => {});
                        ses.estadoConexion = 'DESCONECTADO';
                        ses.qrDataUrlActual = null;
                        ses.qrActualizadoEn = null;
                        ses.numeroConectadoActual = '';
                        ses.nombreConectadoActual = '';
                        ses.ultimoErrorActual = 'La sesión de WhatsApp fue cerrada desde el teléfono. Escanea el código QR nuevamente.';
                        return;
                    }

                    if (statusCode === DisconnectReason.connectionReplaced) {
                        ses.estadoConexion = 'DESCONECTADO';
                        ses.qrDataUrlActual = null;
                        ses.qrActualizadoEn = null;
                        ses.ultimoErrorActual = 'La sesión se abrió desde otro servidor activo (por ejemplo, Vultr y local conectados a la vez). Deja solo uno activo para evitar desconexiones.';
                        return;
                    }

                    if (statusCode === DisconnectReason.restartRequired) {
                        limpiarTimerReconexion(ses);
                        ses.timerReconexion = setTimeout(() => {
                            ses.timerReconexion = null;
                            iniciarConexionWhatsApp(userId, { reiniciarSesion: false }).catch((err) => {
                                console.error(`Error en reinicio requerido WhatsApp (usuario ${userId}):`, err?.message || err);
                            });
                        }, 800);
                        return;
                    }

                    const qrExpiradoSinEscaneo =
                        !estaRegistrado &&
                        (ses.intentosQrSinRegistro >= 4 || errMsg.toLowerCase().includes('qr refs attempts ended'));

                    if (qrExpiradoSinEscaneo) {
                        ses.estadoConexion = 'DESCONECTADO';
                        ses.qrDataUrlActual = null;
                        ses.qrActualizadoEn = null;
                        ses.ultimoErrorActual = 'El código QR venció sin escanearse. Presiona "Vincular mi WhatsApp (QR)" para generar uno nuevo.';
                        return;
                    }

                    ses.intentosReconexion += 1;
                    const delayMs = Math.min(30000, 2000 * Math.pow(2, Math.min(ses.intentosReconexion - 1, 4)));
                    ses.estadoConexion = 'INICIANDO';
                    ses.ultimoErrorActual = `Reconectando con WhatsApp (${errMsg || `código ${statusCode || 'desconocido'}`})...`;

                    limpiarTimerReconexion(ses);
                    ses.timerReconexion = setTimeout(() => {
                        ses.timerReconexion = null;
                        iniciarConexionWhatsApp(userId, { reiniciarSesion: false }).catch((err) => {
                            console.error(`Error reconectando WhatsApp (usuario ${userId}):`, err?.message || err);
                        });
                    }, delayMs);
                }
            });
        } catch (err) {
            console.error(`Error iniciando WhatsApp para usuario #${userId}:`, err?.message || err);
            ses.estadoConexion = 'ERROR';
            ses.ultimoErrorActual = err?.message || 'No se pudo iniciar la conexión con WhatsApp.';
        }
    };

    ses.promesaConexionActiva = ejecutar().finally(() => {
        ses.promesaConexionActiva = null;
    });
    return ses.promesaConexionActiva;
}

async function iniciarWhatsAppSiTieneSesion() {
    try {
        const { rows } = await pool.query(
            "SELECT DISTINCT id_usuario FROM whatsapp_auth_state WHERE clave = 'creds' ORDER BY id_usuario ASC;"
        );
        if (rows.length > 0) {
            console.log(`📱 Restaurando ${rows.length} sesión(es) previa(s) de WhatsApp en segundo plano...`);
            rows.forEach((row, idx) => {
                setTimeout(() => {
                    iniciarConexionWhatsApp(row.id_usuario, { reiniciarSesion: false }).catch((err) => {
                        console.error(`Error restaurando sesión WhatsApp usuario #${row.id_usuario}:`, err?.message || err);
                    });
                }, idx * 1200);
            });
        }
    } catch (err) {
        console.warn('No se pudo verificar sesiones previas de WhatsApp al iniciar:', err?.message || err);
    }
}

async function vincularWhatsApp(idUsuario, { forzarNuevoQr = false } = {}) {
    const userId = parseInt(idUsuario, 10);
    if (!Number.isFinite(userId)) {
        throw new Error('Usuario inválido para vincular WhatsApp.');
    }

    const ses = obtenerOCrearSesion(userId);
    if (ses.estadoConexion === 'CONECTADO' && ses.sockActual && !forzarNuevoQr) {
        return obtenerEstadoWhatsApp(userId, true);
    }
    if (ses.estadoConexion === 'ESPERANDO_QR' && ses.qrDataUrlActual && !forzarNuevoQr) {
        return obtenerEstadoWhatsApp(userId, true);
    }

    const { rows } = await pool.query(
        "SELECT datos FROM whatsapp_auth_state WHERE id_usuario = $1::int AND clave = 'creds' LIMIT 1;",
        [userId]
    );
    let registrado = false;
    if (rows[0]?.datos) {
        try {
            const baileys = await cargarBaileys();
            const creds = JSON.parse(rows[0].datos, baileys.BufferJSON.reviver);
            registrado = Boolean(creds?.registered || creds?.me?.id);
        } catch {
            registrado = false;
        }
    }

    const debeResetear = forzarNuevoQr || !registrado;
    await iniciarConexionWhatsApp(userId, { reiniciarSesion: debeResetear });

    const inicio = Date.now();
    while (
        Date.now() - inicio < 5000 &&
        !ses.qrDataUrlActual &&
        ses.estadoConexion !== 'CONECTADO' &&
        ses.estadoConexion !== 'ERROR' &&
        ses.estadoConexion !== 'DESCONECTADO'
    ) {
        await new Promise((r) => setTimeout(r, 250));
    }

    return obtenerEstadoWhatsApp(userId, true);
}

async function desconectarWhatsApp(idUsuario) {
    const userId = parseInt(idUsuario, 10);
    if (!Number.isFinite(userId)) {
        throw new Error('Usuario inválido para desconectar WhatsApp.');
    }

    const ses = obtenerOCrearSesion(userId);
    ses.cierreIntencional = true;
    const sock = ses.sockActual;
    cerrarSocketSilencioso(ses);
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
    await limpiarSesionEnBD(userId).catch(() => {});
    ses.estadoConexion = 'DESCONECTADO';
    ses.qrDataUrlActual = null;
    ses.qrActualizadoEn = null;
    ses.numeroConectadoActual = '';
    ses.nombreConectadoActual = '';
    ses.ultimoErrorActual = '';
    ses.intentosReconexion = 0;
    ses.intentosQrSinRegistro = 0;
    return obtenerEstadoWhatsApp(userId, true);
}

function obtenerEstadoWhatsApp(idUsuario, incluirQr = true) {
    const userId = parseInt(idUsuario, 10);
    const ses = Number.isFinite(userId) ? obtenerOCrearSesion(userId) : null;
    if (!ses) {
        return {
            estado: 'DESCONECTADO',
            conectado: false,
            numero: '',
            nombre: '',
            ultimo_error: '',
            qr_actualizado_en: null,
            ...(incluirQr ? { qr_data_url: null } : {})
        };
    }

    return {
        estado: ses.estadoConexion,
        conectado: ses.estadoConexion === 'CONECTADO' && Boolean(ses.sockActual),
        numero: ses.numeroConectadoActual || '',
        nombre: ses.nombreConectadoActual || '',
        ultimo_error: ses.ultimoErrorActual || '',
        qr_actualizado_en: ses.qrActualizadoEn || null,
        ...(incluirQr ? { qr_data_url: ses.qrDataUrlActual || null } : {})
    };
}

async function enviarMensajeWhatsApp(idUsuarioEmisor, telefonoDestino, texto) {
    const userId = parseInt(idUsuarioEmisor, 10);
    const numero = normalizarNumeroWhatsApp(telefonoDestino);
    if (!numero) {
        return {
            enviado: false,
            codigo: 'NUMERO_INVALIDO',
            mensaje: 'El número de WhatsApp del destinatario no es válido. Verifícalo en Personal y Roles.'
        };
    }

    const ses = Number.isFinite(userId) ? sesiones.get(userId) : null;
    if (!ses || ses.estadoConexion !== 'CONECTADO' || !ses.sockActual) {
        return {
            enviado: false,
            codigo: 'WHATSAPP_NO_CONECTADO',
            mensaje: 'Tu cuenta aún no tiene vinculado su WhatsApp QR. Presiona "Vincular mi WhatsApp (QR)" en la parte superior para enviar desde tu número.'
        };
    }

    const candidateJid = `${numero}@s.whatsapp.net`;
    let jidFinal = candidateJid;

    try {
        const verificacion = await ses.sockActual.onWhatsApp(candidateJid);
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
        await ses.sockActual.sendMessage(jidFinal, { text: String(texto || '').trim() });
        return {
            enviado: true,
            numero,
            jid: jidFinal
        };
    } catch (sendErr) {
        console.error(`Error enviando mensaje por WhatsApp (usuario #${userId}):`, sendErr?.message || sendErr);
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
