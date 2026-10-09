import axios from 'axios';

//apuntamos al backend que creamos en Node.js
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

//interceptor: antes de cada peticion, pegamos el Token JWT si el usuario inicio sesion
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token_erp');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;