const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'mi-erp-frontend', 'src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove unused React import
    content = content.replace(/import React(?:,\s*\{[^}]*\})?\s*from\s*['"]react['"];\n?/, (match) => {
        if (match.includes('{')) {
            return match.replace(/React,\s*/, '');
        }
        return '';
    });

    // Replace const func = async () => { with async function func() {
    content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*async\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{/g, (match, name) => {
        // We only want to replace if it's assigned to a const and doesn't have complex arguments that we'd misparse,
        // but actually it's easier to just move the useEffect down, or change to function.
        // Let's just do a simpler regex for the specific functions we know:
        return match;
    });

    // Let's just fix the specific issues
    content = content.replace(/const cargarStock = async \(\) => {/, 'async function cargarStock() {');
    content = content.replace(/const cargarHistorial = async \(\) => {/, 'async function cargarHistorial() {');
    content = content.replace(/const cargarUsuarios = async \(\) => {/, 'async function cargarUsuarios() {');
    content = content.replace(/const cargarPedidos = async \(\) => {/, 'async function cargarPedidos() {');

    // Fix unused err
    content = content.replace(/catch \(err\)/g, 'catch (e)');

    fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixes applied.");

