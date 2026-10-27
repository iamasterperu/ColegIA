// Empaqueta public/ en src/estaticos.generado.js para que el Worker sirva la app web.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const CABECERAS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; img-src 'self' data: blob:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()', 'Strict-Transport-Security': 'max-age=31536000',
};
const archivos = {};
(function recorrer(dir, base = '') {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n), r = base + '/' + n;
    if (statSync(p).isDirectory()) recorrer(p, r);
    else if (TIPOS[extname(n)]) archivos[r] = { tipo: TIPOS[extname(n)], texto: readFileSync(p, 'utf8') };
  }
})('public');
writeFileSync('src/estaticos.generado.js', `// Generado por scripts/empaquetar-estaticos.mjs. No editar.\nexport const ARCHIVOS = ${JSON.stringify(archivos)};\nexport const CABECERAS = ${JSON.stringify(CABECERAS)};\n`);
console.log(Object.keys(archivos).length, 'archivos empaquetados');
