import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { imprimirBoletaEnIframe } from '../../utils/boletaTicketHtml';

/**
 * Procesador silencioso de cola de impresión en segundo plano.
 * Se monta en Layout cuando el usuario tiene acceso a Facturación.
 * Si auto_imprimir_navegador está activo, toma la boleta PENDIENTE más antigua,
 * la renderiza en un iframe oculto, dispara print() y la marca IMPRESO.
 */
export default function ImpresoraSegundoPlano({ usuario }) {
  const procesandoRef = useRef(false);
  const iframeRef = useRef(null);

  const puedeFacturar =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.facturacion?.puede_ver === true;

  useEffect(() => {
    if (!puedeFacturar) return;

    const revisarYProcesarCola = async () => {
      if (procesandoRef.current) return;
      if (localStorage.getItem('erp_modo_emergencia') === 'true') return;
      procesandoRef.current = true;
      try {
        const cfgRes = await api.get('/facturacion/boletas-auto/config');
        const cfg = cfgRes.data?.config;
        if (!cfg || !cfg.auto_imprimir_navegador) {
          return;
        }

        const colaRes = await api.get('/facturacion/boletas-auto/cola', { params: { estado: 'PENDIENTE' } });
        const pendientes = colaRes.data?.cola || [];
        if (pendientes.length === 0) return;

        // Imprimir la más antigua pendiente
        const item = pendientes[pendientes.length - 1];
        const numero = await imprimirBoletaEnIframe(item, iframeRef);

        await api.patch(`/facturacion/boletas-auto/cola/${item.id_cola}/estado`, { estado: 'IMPRESO' });
        window.dispatchEvent(new CustomEvent('cola_impresion_actualizada'));
        toast.success(`Boleta ${numero} enviada a impresión automática.`, { icon: '🖨️' });
      } catch (err) {
        console.error('ImpresoraSegundoPlano:', err.message);
      } finally {
        procesandoRef.current = false;
      }
    };

    const timer = setInterval(revisarYProcesarCola, 5000);
    window.addEventListener('cola_impresion_nueva_boleta', revisarYProcesarCola);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cola_impresion_nueva_boleta', revisarYProcesarCola);
      if (iframeRef.current && iframeRef.current.parentNode) {
        iframeRef.current.parentNode.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
    };
  }, [puedeFacturar]);

  return null;
}
