/**
 * Escapa caracteres HTML especiales antes de interpolar texto del sistema o usuario
 * en plantillas HTML usadas para vistas previas o impresión.
 */
export function escaparHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
