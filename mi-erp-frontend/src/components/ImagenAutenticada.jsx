import { useState, useEffect } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import api from '../api';

function normalizarRutaUpload(urlFoto) {
  if (!urlFoto) return '';
  let ruta = String(urlFoto).trim();
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) {
    try {
      ruta = new URL(ruta).pathname;
    } catch {
      return '';
    }
  }
  if (ruta.startsWith('/api/')) {
    return ruta.slice(4); // api ya tiene baseURL .../api
  }
  if (ruta.startsWith('/uploads/')) {
    return ruta;
  }
  return ruta.startsWith('/') ? ruta : `/uploads/pedidos/${ruta}`;
}

export default function ImagenAutenticada({ urlFoto, alt = 'Evidencia de pedido', className = '' }) {
  const [srcBlob, setSrcBlob] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    let urlTemporal = '';
    const ruta = normalizarRutaUpload(urlFoto);

    if (!ruta) {
      Promise.resolve().then(() => {
        if (activo) {
          setSrcBlob('');
          setCargando(false);
          setError(true);
        }
      });
      return () => {
        activo = false;
      };
    }

    Promise.resolve().then(() => {
      if (activo) {
        setCargando(true);
        setError(false);
      }
    });

    api
      .get(ruta, { responseType: 'blob' })
      .then((res) => {
        if (!activo) return;
        urlTemporal = URL.createObjectURL(res.data);
        setSrcBlob(urlTemporal);
      })
      .catch(() => {
        if (activo) setError(true);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
      if (urlTemporal) URL.revokeObjectURL(urlTemporal);
    };
  }, [urlFoto]);

  if (cargando) {
    return (
      <div className={`flex items-center justify-center bg-slate-800 text-slate-300 ${className}`}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (error || !srcBlob) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-800 text-slate-400 text-xs p-3 ${className}`}>
        <ImageOff size={22} className="mb-1" />
        <span>No disponible</span>
      </div>
    );
  }

  return <img src={srcBlob} alt={alt} className={className} loading="lazy" />;
}
