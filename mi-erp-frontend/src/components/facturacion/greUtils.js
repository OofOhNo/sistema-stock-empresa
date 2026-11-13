export function crearEstadoGreInicial(catalogos = {}, direccionLlegada = '') {
  const defPt = catalogos.puntos_partida?.[0];
  const defVeh = catalogos.vehiculos?.[0];
  const defCond = catalogos.conductores?.[0];
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  return {
    tipo_gre: 'REMITENTE',
    comercio_exterior: false,
    motivo_traslado: 'Venta',
    fecha_inicio_traslado: hoyLima,
    id_punto_partida: defPt ? String(defPt.id_punto) : '',
    punto_partida_ubigeo: defPt?.ubigeo || '040101',
    punto_partida_direccion: defPt?.domicilio || '',
    punto_llegada_ubigeo: '',
    punto_llegada_direccion: direccionLlegada || '',
    modalidad_traslado: 'Privado',
    id_vehiculo: defVeh ? String(defVeh.id_vehiculo) : '',
    vehiculo_placa: defVeh?.placa || '',
    id_conductor: defCond ? String(defCond.id_conductor) : '',
    conductor_nombres: defCond?.apellidos_nombres || '',
    conductor_num_doc: defCond?.numero_documento || '',
    conductor_licencia: defCond?.licencia || '',
    retorno_envases_vacios: false,
    retorno_vehiculo_vacio: false,
    transbordo_programado: false,
    traslado_vehiculo_m1_l: false,
    // Campos avanzados de bien (solo Admin Central)
    bien_normalizado: false,
    codigo_bien: '',
    codigo_subpartida: '',
    codigo_sunat: '',
    codigo_gtin: '',
    guardar_bien_frecuente: false
  };
}
