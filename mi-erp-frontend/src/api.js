import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

// Antes de cada petición, enviamos el token si el usuario inició sesión
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token_erp');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Si el token venció o la cuenta fue desactivada, avisar a la app para volver al inicio de sesión
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';
        const mensaje = (error.response?.data?.mensaje || '').toLowerCase();

        const esRutaPublicaAuth =
            url.includes('/auth/login') || url.includes('/auth/solicitar-recuperacion');

        if (!esRutaPublicaAuth) {
            const tokenInvalido =
                status === 401 ||
                ((status === 400 || status === 403) && (
                    mensaje.includes('token inválido') ||
                    mensaje.includes('token invalido') ||
                    mensaje.includes('expirado') ||
                    mensaje.includes('no se proporcionó un token') ||
                    mensaje.includes('token es inválido')
                )) ||
                (status === 404 && url.includes('/auth/perfil') && mensaje.includes('inactivo'));

            if (tokenInvalido && localStorage.getItem('token_erp')) {
                localStorage.removeItem('token_erp');
                localStorage.removeItem('usuario_erp');
                window.dispatchEvent(new CustomEvent('sesion_expirada', {
                    detail: { mensaje: error.response?.data?.mensaje || '' }
                }));
            }
        }

        return Promise.reject(error);
    }
);

export default api;
