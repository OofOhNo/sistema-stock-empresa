const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const Cliente = {

    obtenerTodos: async (idUsuario = null, esAdminCentral = false) => {
        try {
            const query = `
                SELECT 
                    id_cliente,
                    tipo_documento,
                    numero_documento,
                    razon_social_o_nombre,
                    nombre_comercial,
                    contacto,
                    cargo,
                    celular,
                    direccion,
                    email,
                    creado_en
                FROM clientes
                ORDER BY id_cliente ASC;
            `;
            const { rows } = await pool.query(query);

            let permitidosSet = new Set();
            if (!esAdminCentral && idUsuario) {
                const resPermisos = await pool.query(
                    'SELECT id_cliente FROM permisos_celulares_clientes WHERE id_usuario = $1',
                    [idUsuario]
                );
                permitidosSet = new Set(resPermisos.rows.map(r => r.id_cliente));
            }

            return rows.map(c => {
                const puedeVer = esAdminCentral || permitidosSet.has(c.id_cliente);
                return {
                    ...c,
                    celular: puedeVer 
                        ? c.celular 
                        : (c.celular ? '***-***-*** (Oculto)' : null),
                    celular_visible: puedeVer
                };
            });
        } catch (error) {
            throw error;
        }
    },

    buscarPorId: async (id) => {
        const { rows } = await pool.query('SELECT * FROM clientes WHERE id_cliente = $1', [id]);
        return rows[0] || null;
    },

    crearCliente: async (datos, idUsuario) => {
        const {
            tipo_documento = '6',
            numero_documento,
            razon_social_o_nombre,
            nombre_comercial = null,
            contacto = null,
            cargo = null,
            celular = null,
            direccion = null,
            email = null
        } = datos;

        if (!numero_documento || !razon_social_o_nombre) {
            throw new Error('El RUC/documento y la razón social son obligatorios.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO clientes (
                    tipo_documento, numero_documento, razon_social_o_nombre,
                    nombre_comercial, contacto, cargo, celular, direccion, email
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *;
            `;
            const { rows } = await client.query(query, [
                tipo_documento,
                numero_documento.trim(),
                razon_social_o_nombre.trim(),
                nombre_comercial ? nombre_comercial.trim() : null,
                contacto ? contacto.trim() : null,
                cargo ? cargo.trim() : null,
                celular ? celular.trim() : null,
                direccion ? direccion.trim() : null,
                email ? email.trim() : null
            ]);
            const nuevoCliente = rows[0];

            await registrarAuditoria(
                client,
                idUsuario,
                'CREAR_CLIENTE',
                'clientes',
                nuevoCliente.id_cliente,
                null,
                nuevoCliente
            );

            await client.query('COMMIT');
            return nuevoCliente;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    actualizarCliente: async (id, datos, idUsuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const actual = await client.query('SELECT * FROM clientes WHERE id_cliente = $1 FOR UPDATE', [id]);
            if (actual.rows.length === 0) {
                throw new Error('Cliente no encontrado.');
            }
            const anterior = actual.rows[0];

            const query = `
                UPDATE clientes
                SET 
                    tipo_documento = COALESCE($1, tipo_documento),
                    numero_documento = COALESCE($2, numero_documento),
                    razon_social_o_nombre = COALESCE($3, razon_social_o_nombre),
                    nombre_comercial = $4,
                    contacto = $5,
                    cargo = $6,
                    celular = COALESCE($7, celular),
                    direccion = $8,
                    email = $9
                WHERE id_cliente = $10
                RETURNING *;
            `;
            const { rows } = await client.query(query, [
                datos.tipo_documento || anterior.tipo_documento,
                datos.numero_documento ? datos.numero_documento.trim() : anterior.numero_documento,
                datos.razon_social_o_nombre ? datos.razon_social_o_nombre.trim() : anterior.razon_social_o_nombre,
                datos.nombre_comercial !== undefined ? datos.nombre_comercial : anterior.nombre_comercial,
                datos.contacto !== undefined ? datos.contacto : anterior.contacto,
                datos.cargo !== undefined ? datos.cargo : anterior.cargo,
                datos.celular !== undefined ? datos.celular : anterior.celular,
                datos.direccion !== undefined ? datos.direccion : anterior.direccion,
                datos.email !== undefined ? datos.email : anterior.email,
                id
            ]);
            const actualizado = rows[0];

            await registrarAuditoria(
                client,
                idUsuario,
                'ACTUALIZAR_CLIENTE',
                'clientes',
                id,
                anterior,
                actualizado
            );

            await client.query('COMMIT');
            return actualizado;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    obtenerPermisosCelularUsuario: async (idUsuario) => {
        const query = `
            SELECT id_cliente 
            FROM permisos_celulares_clientes 
            WHERE id_usuario = $1
            ORDER BY id_cliente ASC;
        `;
        const { rows } = await pool.query(query, [idUsuario]);
        return rows.map(r => r.id_cliente);
    },

    actualizarPermisosCelularUsuario: async (idUsuario, clientesIds = [], idAdmin = null) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Limpiar permisos actuales del usuario
            await client.query(
                'DELETE FROM permisos_celulares_clientes WHERE id_usuario = $1',
                [idUsuario]
            );

            // Insertar los nuevos permisos seleccionados
            if (Array.isArray(clientesIds) && clientesIds.length > 0) {
                for (const idCliente of clientesIds) {
                    await client.query(
                        'INSERT INTO permisos_celulares_clientes (id_usuario, id_cliente) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [idUsuario, idCliente]
                    );
                }
            }

            await registrarAuditoria(
                client,
                idAdmin,
                'ACTUALIZAR_PERMISOS_CELULAR_CLIENTES',
                'permisos_celulares_clientes',
                idUsuario,
                null,
                { id_usuario: idUsuario, clientes_permitidos: clientesIds }
            );

            await client.query('COMMIT');
            return { exito: true, total: clientesIds.length };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

};

module.exports = Cliente;

