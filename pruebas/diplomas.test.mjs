// Diplomas con diseño propio: nombre sobre el PDF del colegio, PDF único y ZIP válido.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
globalThis.document = { createElement: () => ({}), head: {} };
globalThis.window = globalThis;
const { diplomaUno, diplomaTodos, crearZip, bonito } = await import('../public/js/vistas/diplomas.js');
const PDFLib = createRequire(import.meta.url)('/opt/npm-tools/node_modules/pdf-lib');

const base = await (async () => { const d = await PDFLib.PDFDocument.create(); d.addPage([842, 595]); return d.save(); })();
const cfg = { x: 50, y: 45, tam: 40, color: '#1e3a8a', estilo: 'elegante' };
assert.equal(bonito('MARÍA FERNANDA  quispe'), 'María Fernanda Quispe');
const uno = await diplomaUno(PDFLib, base, 'María Fernanda Quispe Huamán', cfg);
assert.equal((await PDFLib.PDFDocument.load(uno)).getPageCount(), 1);
const todos = await diplomaTodos(PDFLib, base, ['Ana Paz', 'Luis Ríos', 'Nombre Larguísimo De Prueba Para Achicar La Letra Sola Sin Romper El Diploma'], cfg);
assert.equal((await PDFLib.PDFDocument.load(todos)).getPageCount(), 3);
const zip = crearZip([{ nombre: '1 Paz Ana.pdf', datos: uno }, { nombre: '2 Ríos Luis.pdf', datos: uno }]);
const dir = mkdtempSync(join(tmpdir(), 'zip-'));
writeFileSync(join(dir, 'x.zip'), new Uint8Array(await zip.arrayBuffer()));
const salida = execFileSync('unzip', ['-t', join(dir, 'x.zip')]).toString();
assert.match(salida, /No errors detected/);
console.log('diplomas: todo bien');
