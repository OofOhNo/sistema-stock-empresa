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
    numero_de_bultos: 1,
    observaciones: '',
    transportista_ruc: '',
    transportista_razon_social: '',
    transportista_nro_mtc: '',
    remitente_tipo_doc: '6',
    remitente_num_doc: '',
    remitente_razon_social: '',
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

/**
 * Valida reglas SUNAT mínimas de una GRE antes de enviarla (modalidad 01/02 y tipo 09/31).
 */
export function validarFormularioGre(greForm = {}, configSunat = null) {
  if (!greForm.punto_llegada_direccion?.trim()) {
    return 'Completa la dirección del punto de llegada para la GRE.';
  }
  if (greForm.tipo_gre === 'TRANSPORTISTA') {
    if (!String(greForm.remitente_num_doc || '').trim() || !String(greForm.remitente_razon_social || '').trim()) {
      return 'Para emitir una GRE Transportista (31) debes completar el documento y razón social del Remitente.';
    }
  } else if (greForm.modalidad_traslado === 'Publico') {
    if (!/^(10|15|16|17|20)\d{9}$/.test(String(greForm.transportista_ruc || '').trim()) || !String(greForm.transportista_razon_social || '').trim()) {
      return 'Para Transporte Público (01) debes ingresar el RUC (11 díg.) y Razón Social de la empresa transportista.';
    }
  }

  const modoReal = configSunat?.modo_integracion === 'APISPERU' || configSunat?.modo_integracion === 'NUBEFACT_REAL';
  if (modoReal) {
    if (!/^\d{6}$/.test(String(greForm.punto_partida_ubigeo || '').trim())) {
      return 'Para GRE real en SUNAT, el Ubigeo del punto de partida debe tener 6 dígitos.';
    }
    if (!/^\d{6}$/.test(String(greForm.punto_llegada_ubigeo || '').trim())) {
      return 'Para GRE real en SUNAT, ingresa el Ubigeo (6 dígitos) del punto de llegada antes de emitir.';
    }
  }

  return null;
}
