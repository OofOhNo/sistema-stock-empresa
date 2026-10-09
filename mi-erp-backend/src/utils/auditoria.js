const registrarAuditoria = async (client, id_usuario, accion, entidad, id_entidad, antes, despues) => {
    const query = `
        INSERT INTO auditoria (id_usuario, accion, entidad, id_entidad, antes, despues)
        VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const valores = [
        id_usuario, 
        accion, 
        entidad, 
        id_entidad, 
        antes ? JSON.stringify(antes) : null, 
        despues ? JSON.stringify(despues) : null
    ];
    await client.query(query, valores);
};

module.exports = { registrarAuditoria };

