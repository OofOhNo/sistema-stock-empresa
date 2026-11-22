const fs = require('fs');
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

function obtenerSocketConectado(idUsuario) {
    const userId = parseInt(idUsuario, 10);
    const ses = Number.isFinite(userId) ? sesiones.get(userId) : null;
    if (!ses || ses.estadoConexion !== 'CONECTADO' || !ses.sockActual) {
        return {
            ok: false,
            codigo: 'WHATSAPP_NO_CONECTADO',
            mensaje: 'Tu cuenta aún no tiene vinculado su WhatsApp QR. Presiona "Vincular mi WhatsApp (QR)" en la parte superior para enviar desde tu número.'
        };
    }
    const numeroPropio = normalizarNumeroWhatsApp(
        ses.numeroConectadoActual || extraerNumeroDeUserId(ses.sockActual.user?.id)
    );
    return { ok: true, userId, sock: ses.sockActual, numeroPropio };
}

async function resolverJidsWhatsAppPorTelefonos(sock, telefonos = [], numeroPropio = '') {
    const numerosUnicos = [...new Set((telefonos || []).map(normalizarNumeroWhatsApp))]
        .filter((n) => Boolean(n) && n !== numeroPropio);
    if (numerosUnicos.length === 0) {
        return { jids: [], numerosValidos: [] };
    }

    const candidatos = numerosUnicos.map((n) => `${n}@s.whatsapp.net`);
    try {
        const res = await sock.onWhatsApp(...candidatos);
        if (Array.isArray(res) && res.length > 0) {
            const validos = res.filter((r) => r && r.exists !== false && r.jid);
            const jids = [...new Set(validos.map((r) => r.jid))];
            const numerosValidos = jids.map((j) => extraerNumeroDeUserId(j)).filter(Boolean);
            return { jids, numerosValidos };
        }
        return { jids: [], numerosValidos: [] };
    } catch (err) {
        console.warn('Advertencia verificando participantes de WhatsApp:', err?.message || err);
        return { jids: candidatos, numerosValidos: numerosUnicos };
    }
}

function construirContenidoMensajeWhatsApp({ texto = '', adjunto = null }) {
    const textoLimpio = String(texto || '').trim();
    if (adjunto && adjunto.rutaLocal && fs.existsSync(adjunto.rutaLocal)) {
        if (adjunto.tipo === 'IMAGEN') {
            return {
                image: { url: adjunto.rutaLocal },
                ...(textoLimpio ? { caption: textoLimpio } : {}),
                ...(adjunto.mime ? { mimetype: adjunto.mime } : {})
            };
        }
        return {
            document: { url: adjunto.rutaLocal },
            mimetype: adjunto.mime || 'application/octet-stream',
            fileName: adjunto.nombre || 'archivo',
            ...(textoLimpio ? { caption: textoLimpio } : {})
        };
    }
    return { text: textoLimpio };
}

async function enviarMensajeWhatsApp(idUsuarioEmisor, telefonoDestino, texto, adjunto = null) {
    const numero = normalizarNumeroWhatsApp(telefonoDestino);
    if (!numero) {
        return {
            enviado: false,
            codigo: 'NUMERO_INVALIDO',
            mensaje: 'El número de WhatsApp del destinatario no es válido. Verifícalo en Personal y Roles.'
        };
    }

    const conn = obtenerSocketConectado(idUsuarioEmisor);
    if (!conn.ok) {
        return {
            enviado: false,
            codigo: conn.codigo,
            mensaje: conn.mensaje
        };
    }

    const candidateJid = `${numero}@s.whatsapp.net`;
    let jidFinal = candidateJid;

    try {
        const verificacion = await conn.sock.onWhatsApp(candidateJid);
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
        const contenido = construirContenidoMensajeWhatsApp({ texto, adjunto });
        await conn.sock.sendMessage(jidFinal, contenido);
        return {
            enviado: true,
            numero,
            jid: jidFinal
        };
    } catch (sendErr) {
        console.error(`Error enviando mensaje por WhatsApp (usuario #${conn.userId}):`, sendErr?.message || sendErr);
        return {
            enviado: false,
            codigo: 'ERROR_ENVIO_WHATSAPP',
            mensaje: `No se pudo entregar el mensaje por WhatsApp (${sendErr?.message || 'error de conexión'}).`
        };
    }
}

async function listarGruposWhatsApp(idUsuario) {
    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) {
        return {
            ok: false,
            codigo: conn.codigo,
            grupos: [],
            mensaje: 'Vincula tu WhatsApp (QR) primero para ver tus grupos existentes de WhatsApp.'
        };
    }

    try {
        const mapa = await conn.sock.groupFetchAllParticipating();
        const grupos = Object.values(mapa || {})
            .filter((g) => g && g.id && !g.isCommunity)
            .map((g) => ({
                jid: g.id,
                nombre: g.subject || 'Grupo sin nombre',
                descripcion: g.desc || '',
                total_participantes: g.size || (Array.isArray(g.participants) ? g.participants.length : 0),
                es_comunidad_anuncios: Boolean(g.isCommunityAnnounce)
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        return { ok: true, grupos };
    } catch (err) {
        console.error(`Error listando grupos de WhatsApp (usuario #${conn.userId}):`, err?.message || err);
        return {
            ok: false,
            codigo: 'ERROR_LISTAR_GRUPOS_WA',
            grupos: [],
            mensaje: `No se pudieron cargar tus grupos de WhatsApp (${err?.message || 'error de conexión'}).`
        };
    }
}

async function validarGrupoWhatsAppExistente(idUsuario, groupJid) {
    const jidLimpio = String(groupJid || '').trim();
    if (!jidLimpio || !jidLimpio.endsWith('@g.us')) {
        return {
            valido: false,
            codigo: 'JID_INVALIDO',
            mensaje: 'El grupo seleccionado no tiene un identificador válido de WhatsApp.'
        };
    }

    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) {
        return {
            valido: false,
            codigo: conn.codigo,
            mensaje: 'Conecta tu WhatsApp (QR) primero para vincular un grupo existente de WhatsApp.'
        };
    }

    try {
        const meta = await conn.sock.groupMetadata(jidLimpio);
        if (!meta?.id) {
            return {
                valido: false,
                codigo: 'GRUPO_NO_ENCONTRADO',
                mensaje: 'No se encontró ese grupo en tu WhatsApp.'
            };
        }
        return {
            valido: true,
            grupo: {
                jid: meta.id,
                nombre: meta.subject || '',
                descripcion: meta.desc || '',
                total_participantes: meta.size || (Array.isArray(meta.participants) ? meta.participants.length : 0)
            }
        };
    } catch (err) {
        console.warn(`Error validando grupo WA ${jidLimpio}:`, err?.message || err);
        return {
            valido: false,
            codigo: 'GRUPO_NO_ACCESIBLE',
            mensaje: 'No pudimos acceder a ese grupo desde tu cuenta de WhatsApp. Verifica que sigas formando parte de él.'
        };
    }
}

/**
 * Crea un grupo real en WhatsApp usando el socket conectado del creador.
 */
async function crearGrupoWhatsApp(idUsuarioCreador, { nombre, descripcion = '', telefonosParticipantes = [] }) {
    const conn = obtenerSocketConectado(idUsuarioCreador);
    if (!conn.ok) {
        return {
            creado: false,
            codigo: conn.codigo,
            mensaje: 'Tu WhatsApp QR no está conectado aún; el grupo se creó solo en el chat interno.'
        };
    }

    const { jids } = await resolverJidsWhatsAppPorTelefonos(conn.sock, telefonosParticipantes, conn.numeroPropio);
    if (jids.length === 0) {
        return {
            creado: false,
            codigo: 'SIN_PARTICIPANTES_WA',
            mensaje: 'Ningún otro integrante tiene un WhatsApp válido registrado, así que solo se creó en el chat interno.'
        };
    }

    const asunto = String(nombre || '').trim().slice(0, 100) || 'Grupo ERP';
    try {
        const meta = await conn.sock.groupCreate(asunto, jids);
        if (!meta?.id) {
            return {
                creado: false,
                codigo: 'ERROR_CREAR_GRUPO_WA',
                mensaje: 'WhatsApp no devolvió un identificador de grupo válido.'
            };
        }
        const descLimpia = String(descripcion || '').trim().slice(0, 512);
        if (descLimpia) {
            await conn.sock.groupUpdateDescription(meta.id, descLimpia).catch(() => {});
        }
        return {
            creado: true,
            groupJid: meta.id,
            subject: meta.subject || asunto,
            participantesSolicitados: jids.length,
            totalParticipantes: meta.size || meta.participants?.length || (jids.length + 1)
        };
    } catch (err) {
        console.error(`Error creando grupo en WhatsApp (usuario #${conn.userId}):`, err?.message || err);
        return {
            creado: false,
            codigo: 'ERROR_CREAR_GRUPO_WA',
            mensaje: `El grupo se creó en el ERP, pero WhatsApp devolvió un error (${err?.message || 'no permitido'}).`
        };
    }
}

/**
 * Envía un mensaje a un grupo real de WhatsApp. Si el grupo del ERP todavía no tiene `groupJid`,
 * intenta crearlo en WhatsApp automáticamente antes de enviar.
 */
async function enviarMensajeGrupoWhatsApp(idUsuarioEmisor, {
    groupJid = null,
    nombre = '',
    descripcion = '',
    telefonosParticipantes = [],
    texto = '',
    adjunto = null
}) {
    const conn = obtenerSocketConectado(idUsuarioEmisor);
    if (!conn.ok) {
        return {
            enviado: false,
            codigo: conn.codigo,
            mensaje: 'Tu cuenta aún no tiene vinculado su WhatsApp QR para enviarlo al grupo de WhatsApp.'
        };
    }

    let jidDestino = groupJid || null;
    let nuevoGroupJid = null;
    let creadoAhora = false;

    if (!jidDestino) {
        const resCrear = await crearGrupoWhatsApp(idUsuarioEmisor, {
            nombre,
            descripcion,
            telefonosParticipantes
        });
        if (!resCrear.creado) {
            return {
                enviado: false,
                codigo: resCrear.codigo,
                mensaje: resCrear.mensaje,
                nuevoGroupJid: null
            };
        }
        jidDestino = resCrear.groupJid;
        nuevoGroupJid = resCrear.groupJid;
        creadoAhora = true;
        await new Promise((r) => setTimeout(r, 300));
    }

    try {
        const contenido = construirContenidoMensajeWhatsApp({ texto, adjunto });
        await conn.sock.sendMessage(jidDestino, contenido);
        return {
            enviado: true,
            groupJid: jidDestino,
            nuevoGroupJid,
            creadoAhora,
            mensaje: creadoAhora
                ? 'Se creó el grupo en WhatsApp y se envió el mensaje.'
                : 'Enviado al grupo del ERP y al grupo de WhatsApp.'
        };
    } catch (err) {
        const msgErr = String(err?.message || '');
        console.error(`Error enviando mensaje al grupo de WhatsApp (${jidDestino}):`, msgErr);
        const esSinPermiso = /401|403|404|not-authorized|forbidden|not-a-participant|gone|item-not-found/i.test(msgErr);
        return {
            enviado: false,
            codigo: esSinPermiso ? 'NO_EN_GRUPO_WA' : 'ERROR_ENVIO_GRUPO_WA',
            nuevoGroupJid,
            mensaje: esSinPermiso
                ? 'Tu número de WhatsApp aún no figura dentro de este grupo de WhatsApp. Sincroniza participantes o pide a un administrador que te agregue.'
                : `No se pudo enviar al grupo en WhatsApp (${msgErr || 'error de conexión'}).`
        };
    }
}

async function actualizarGrupoWhatsApp(idUsuario, groupJid, { nombre, descripcion }) {
    if (!groupJid) return { sincronizado: false };
    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) return { sincronizado: false, codigo: conn.codigo };

    try {
        if (nombre && String(nombre).trim()) {
            await conn.sock.groupUpdateSubject(groupJid, String(nombre).trim().slice(0, 100));
        }
        if (descripcion !== undefined) {
            const desc = String(descripcion || '').trim().slice(0, 512);
            await conn.sock.groupUpdateDescription(groupJid, desc || undefined).catch(() => {});
        }
        return { sincronizado: true };
    } catch (err) {
        console.warn(`No se pudo actualizar metadatos del grupo WA ${groupJid}:`, err?.message || err);
        return { sincronizado: false, mensaje: err?.message || 'Error al actualizar grupo en WhatsApp.' };
    }
}

async function actualizarParticipantesGrupoWhatsApp(idUsuario, groupJid, telefonos = [], accion = 'add') {
    if (!groupJid) return { sincronizado: false };
    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) return { sincronizado: false, codigo: conn.codigo };

    const { jids } = await resolverJidsWhatsAppPorTelefonos(conn.sock, telefonos, conn.numeroPropio);
    if (jids.length === 0) return { sincronizado: false, codigo: 'SIN_PARTICIPANTES_WA' };

    try {
        const resultados = await conn.sock.groupParticipantsUpdate(groupJid, jids, accion);
        return { sincronizado: true, resultados };
    } catch (err) {
        console.warn(`No se pudo ejecutar "${accion}" en grupo WA ${groupJid}:`, err?.message || err);
        return { sincronizado: false, mensaje: err?.message || 'No se pudieron actualizar participantes en WhatsApp.' };
    }
}

async function salirGrupoWhatsApp(idUsuario, groupJid) {
    if (!groupJid) return { sincronizado: false };
    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) return { sincronizado: false, codigo: conn.codigo };
    try {
        await conn.sock.groupLeave(groupJid);
        return { sincronizado: true };
    } catch (err) {
        console.warn(`No se pudo salir del grupo WA ${groupJid}:`, err?.message || err);
        return { sincronizado: false, mensaje: err?.message };
    }
}

async function sincronizarGrupoEnWhatsApp(idUsuario, grupo) {
    const conn = obtenerSocketConectado(idUsuario);
    if (!conn.ok) {
        return { sincronizado: false, codigo: conn.codigo, mensaje: conn.mensaje };
    }

    const telefonosOtros = (grupo?.miembros || [])
        .filter((m) => Number(m.id_usuario) !== Number(idUsuario))
        .map((m) => m.telefono_whatsapp);

    if (!grupo?.whatsapp_group_jid) {
        const resCrear = await crearGrupoWhatsApp(idUsuario, {
            nombre: grupo?.nombre,
            descripcion: grupo?.descripcion || '',
            telefonosParticipantes: telefonosOtros
        });
        if (!resCrear.creado) {
            return { sincronizado: false, codigo: resCrear.codigo, mensaje: resCrear.mensaje };
        }
        return {
            sincronizado: true,
            creado: true,
            groupJid: resCrear.groupJid,
            mensaje: `Grupo creado en WhatsApp (${resCrear.totalParticipantes} participantes).`
        };
    }

    const { jids } = await resolverJidsWhatsAppPorTelefonos(conn.sock, telefonosOtros, conn.numeroPropio);
    let faltantesJids = jids;
    try {
        const meta = await conn.sock.groupMetadata(grupo.whatsapp_group_jid);
        const actualesNums = new Set(
            (meta?.participants || [])
                .map((p) => extraerNumeroDeUserId(p.phoneNumber || p.id))
                .filter(Boolean)
        );
        faltantesJids = jids.filter((j) => !actualesNums.has(extraerNumeroDeUserId(j)));
    } catch (metaErr) {
        console.warn(`Error leyendo metadata de grupo WA ${grupo.whatsapp_group_jid}:`, metaErr?.message || metaErr);
    }

    if (faltantesJids.length > 0) {
        await conn.sock.groupParticipantsUpdate(grupo.whatsapp_group_jid, faltantesJids, 'add').catch(() => {});
    }
    await actualizarGrupoWhatsApp(idUsuario, grupo.whatsapp_group_jid, {
        nombre: grupo.nombre,
        descripcion: grupo.descripcion || ''
    });

    return {
        sincronizado: true,
        creado: false,
        groupJid: grupo.whatsapp_group_jid,
        agregados: faltantesJids.length,
        mensaje: faltantesJids.length > 0
            ? `Grupo sincronizado con WhatsApp (${faltantesJids.length} participante(s) nuevo(s) agregado(s)).`
            : 'El grupo ya está sincronizado con WhatsApp.'
    };
}

module.exports = {
    normalizarNumeroWhatsApp,
    iniciarWhatsAppSiTieneSesion,
    vincularWhatsApp,
    desconectarWhatsApp,
    obtenerEstadoWhatsApp,
    enviarMensajeWhatsApp,
    crearGrupoWhatsApp,
    listarGruposWhatsApp,
    validarGrupoWhatsAppExistente,
    enviarMensajeGrupoWhatsApp,
    sincronizarGrupoEnWhatsApp,
    actualizarGrupoWhatsApp,
    actualizarParticipantesGrupoWhatsApp,
    salirGrupoWhatsApp
};
