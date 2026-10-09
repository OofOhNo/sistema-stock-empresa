const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'mi-erp-frontend', 'src');

function traverse(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            traverse(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            content = content.replace(/id_sucursal/g, 'id_ubicacion');
            content = content.replace(/sucursal_id/g, 'ubicacion_id');
            // Keep the word sucursal visually for users if needed? No, let's just replace all
            // wait, in frontend, "Sucursal" might be shown to the user. "Ubicación" is better.
            content = content.replace(/Sucursal/g, 'Ubicación');
            content = content.replace(/sucursal/g, 'ubicacion');
            content = content.replace(/sucursales/g, 'ubicaciones');

            if (content !== original) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

traverse(dir);
console.log('Migration complete.');

