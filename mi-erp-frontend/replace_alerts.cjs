const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/maria/mi-erp-backend/sistema-stock/mi-erp-frontend/src/pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    if (!content.includes('import toast') && (content.includes('alert('))) {
        content = content.replace(/(import .*?;?\n)/, "$1import toast from 'react-hot-toast';\n");
    }

    content = content.replace(/return alert\((.*?)\);/g, "return toast.error($1);");
    content = content.replace(/alert\('Error(.*?):\s*'\s*\+\s*(.*?)\);/g, "toast.error('Error$1: ' + $2);");
    content = content.replace(/alert\('Error(.*?)\);/g, "toast.error('Error$1);");
    content = content.replace(/alert\('!?(.*?)(\!|\.)?'\);/g, "toast.success('$1$2');");
    content = content.replace(/alert\((.*?)\);/g, "toast.success($1);");
    
    // Convert window.confirm to a custom modal later or leave for now
    fs.writeFileSync(path.join(dir, file), content);
});
