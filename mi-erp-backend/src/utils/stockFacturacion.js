/**
 * Descuenta inventario físico (y reservas si aplica) y registra salida en kardex
 * para ítems emitidos desde los módulos de facturación.
 */
async function descontarStockPorItems(client, {
    items = [],
    idUbicacion,
    idUsuario = null,
    motivo = 'Salida desde Facturación',
    liberarReserva = false
}) {
    if (!idUbicacion || !Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
        const cantidadReal = Number(item.cantidad) || 0;
        if (cantidadReal <= 0 || !item.id_producto) continue;

        const resInv = await client.query(
            'SELECT id_inventario FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
            [item.id_producto, idUbicacion]
        );
        if (resInv.rows.length === 0) {
            await client.query(
                'INSERT INTO inventario (id_producto, id_ubicacion, cantidad_fisica, cantidad_reservada) VALUES ($1, $2, 0, 0)',
                [item.id_producto, idUbicacion]
            );
        }

        if (liberarReserva) {
            await client.query(`
                UPDATE inventario
                SET cantidad_fisica = cantidad_fisica - $1,
                    cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3;
            `, [cantidadReal, item.id_producto, idUbicacion]);
        } else {
            await client.query(`
                UPDATE inventario
                SET cantidad_fisica = cantidad_fisica - $1,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3;
            `, [cantidadReal, item.id_producto, idUbicacion]);
        }

        const motivoFinal = typeof motivo === 'function' ? motivo(item) : motivo;
        await client.query(`
            INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
            VALUES ($1, $2, $3, 'SALIDA', $4, $5);
        `, [item.id_producto, idUbicacion, idUsuario, cantidadReal, motivoFinal]);
    }
}

/**
 * Normaliza el flag booleano decrece_stock (siempre FALSE por defecto).
 */
function parsearDecreceStock(valor) {
    return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

module.exports = {
    descontarStockPorItems,
    parsearDecreceStock
};
