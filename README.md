# 🚀 Mi ERP - Sistema de Gestión de Stock, Ventas y Facturación

Sistema ERP completo con control de inventario en tiempo real, doble calendario (pedidos y eventos extraordinarios), facturación electrónica SUNAT, matriz de permisos jerárquicos (RBAC) y auditoría inmutable.

---

## 🛠️ Tecnologías

- **Backend:** Node.js, Express 5, PostgreSQL (`pg`), JWT, Bcrypt
- **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, React Hot Toast
- **Base de Datos:** Compatible con Supabase y PostgreSQL 16+
- **Contenedores:** Docker & Docker Compose (Nginx multi-stage + Node Alpine)

---

## ⚡ Inicio Rápido con Docker & Supabase

### 1. Configurar variables de entorno
Copia la plantilla `.env.example` en la carpeta `mi-erp-backend/`:
```bash
cp mi-erp-backend/.env.example mi-erp-backend/.env
```

Edita `mi-erp-backend/.env` con la cadena de conexión de tu proyecto en Supabase:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:[TU_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
DATABASE_SSL_STRICT=false
JWT_SECRET=tu_secreto_seguro_jwt_2026
CORS_ORIGIN=http://localhost:5173,http://localhost:80,http://localhost
VITE_API_URL=/api
```

### 2. Iniciar la aplicación
En la raíz del proyecto, ejecuta:
```bash
docker compose up --build -d
```

Las migraciones de base de datos se aplicarán automáticamente al arrancar.

### 3. Acceso en el navegador
- **Frontend Web:** [http://localhost](http://localhost) o [http://localhost:5173](http://localhost:5173)
- **API Backend:** [http://localhost:3000](http://localhost:3000)

---

## 📋 Módulos Principales

1. **Dashboard:** Resumen métrico de ventas facturadas, pedidos pendientes y alertas de reposición.
2. **Control de Inventario (Kardex):** Registro de ingresos y salidas con regla de 10 minutos para autocorrección y flujo de aprobación por superiores.
3. **Catálogo de Productos:** Gestión de precio de costo, precio de venta, margen comercial y stock mínimo con baja lógica.
4. **Calendario de Pedidos:** Control de despachos semanales, cliente facturable y solicitante.
5. **Calendario de Reuniones:** Organización de reuniones de empleados y registro de fechas imprevistas/contingencias.
6. **Facturación Electrónica:** Emisión de Facturas (`01`), Boletas (`03`) y Notas de Crédito (`07`) con correlativos estrictos y control fiscal.
7. **Personal y Permisos:** Jerarquía de 4 roles (`Admin Central`, `Gerente de Área`, `Jefe de División`, `Vendedor`) con matriz de permisos y trazabilidad de auditoría inmutable.
8. **Ubicaciones:** Administración de almacenes y sucursales por división.

