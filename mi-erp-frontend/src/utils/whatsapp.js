/**
 * Normaliza un número telefónico para enlaces wa.me (solo dígitos).
 * Si tiene 9 dígitos e inicia con 9 (formato móvil Perú), antepone el código 51.
 */
export function normalizarNumeroWhatsApp(telefono) {
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
 * Construye una URL segura para abrir chat directo de WhatsApp (https://wa.me/...).
 */
export function construirUrlWhatsApp(telefono, texto = '') {
  const numero = normalizarNumeroWhatsApp(telefono);
  if (!numero) return '';
  const base = `https://wa.me/${numero}`;
  const limpio = String(texto || '').trim();
  return limpio ? `${base}?text=${encodeURIComponent(limpio)}` : base;
}
