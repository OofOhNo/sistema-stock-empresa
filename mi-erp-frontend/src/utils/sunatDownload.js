import api from '../api';

/**
 * Descarga un archivo XML o CDR desde URL externa o ruta protegida /api/facturacion/...
 */
export async function descargarArchivoSunat(url, fallbackNombre = 'archivo-sunat.xml') {
  if (!url) return;
  if (/^https?:\/\//i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const rutaRelativa = url.replace(/^\/api(?=\/)/i, '');
  const res = await api.get(rutaRelativa, { responseType: 'blob' });
  const disp = res.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(disp);
  const filename = match ? match[1] : fallbackNombre;

  const blobUrl = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
