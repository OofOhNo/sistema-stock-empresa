# Backend Improvements Summary

During the review of the `mi-erp-backend` codebase, several critical issues were identified and resolved to improve security, robustness, and code quality.

## Improvements Made:

1. **Removed Hardcoded Credentials (Security)**
   - **File:** `src/config/db.js`
   - **Issue:** The database connection string including the password was hardcoded as a fallback.
   - **Fix:** Removed the hardcoded fallback string. The connection now strictly relies on `process.env.DATABASE_URL` to ensure secrets are not exposed in the codebase.

2. **Fixed SQL Syntax Error (Bad Code Structure)**
   - **File:** `src/models/pedidoModel.js`
   - **Issue:** In the `obtenerParaCalendario` method, the SQL query had an invalid structure. An `ORDER BY` clause was appended before the `WHERE` clause, and then another `ORDER BY` clause was appended at the end.
   - **Fix:** Restructured the string concatenation to correctly append the `WHERE` clause first, and then apply a single `ORDER BY` clause at the end.

3. **Added Missing SQL Error Handling and Fixed Schema Mismatch (Error Handling & Bug Fix)**
   - **File:** `src/models/usuarioModel.js`
   - **Issue:** The `cambiarRol` method lacked a `try-catch` block to properly handle database errors. Additionally, the SQL query attempted to update a non-existent `rol` column instead of the actual `rol_id` column used by the schema.
   - **Fix:** Added a `try-catch` block to handle and propagate errors. Also updated the SQL query to resolve the role name to its corresponding `id_rol` via a subquery and update the `rol_id` column accordingly.

4. **Added Input Validation in Kardex (Security/Robustness)**
   - **File:** `src/controllers/kardexController.js`
   - **Issue:** The `registrarMovimiento` endpoint lacked validation for required fields, allowing invalid `cantidad` (e.g., `NaN` or `undefined`) or `tipo_movimiento` values.
   - **Fix:** Implemented strict checks to ensure all required fields are present, that `cantidad` is a valid number greater than 0, and that `tipo_movimiento` is strictly `'INGRESO'` or `'SALIDA'`.

5. **Added Input Validation and Safe Rollback in Facturación (Security/Robustness)**
   - **File:** `src/controllers/facturaController.js`
   - **Issue:** The `emitirComprobante` endpoint did not validate `id_pedido` or `tipo_comprobante`. If invalid data was provided, it could lead to unexpected behavior or database errors later in the transaction.
   - **Fix:** Added validation checks at the beginning of the transaction. If validation fails, it safely performs a `ROLLBACK` and returns an appropriate 400 Bad Request error.

6. **Verified require paths in `index.js`**
   - **File:** `index.js`
   - **Issue:** The user requested to ensure require paths in `index.js` are correct.
   - **Fix:** Verified that all paths (e.g., `./src/config/db`, `./src/routes/usuarioRoutes.js`) correctly resolve to the files located inside the `src` directory from the `index.js` file location.

These changes ensure the backend API is more resilient to invalid inputs, handles transactions safely without dangling connections, and maintains best practices regarding sensitive configuration data.

