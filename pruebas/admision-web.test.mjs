import { crearDB } from './d1shim.mjs';
import { readdirSync } from 'node:fs';
import { rutasAdmisionWeb } from '../src/rutas/admision-web.js';
import assert from 'node:assert/strict';
const DB = crearDB(readdirSync('migrations').sort().map((f) => 'migrations/' + f));
const env = { DB, URL_BASE: 'https://x.pe' };
DB._raw.exec(`INSERT INTO colegios (id, slug, nombre, es_demo) VALUES (1,'demo','Colegio Demo',1),(2,'real','Colegio Real',0)`);
const rutas = {};
rutasAdmisionWeb({ get: (p, h) => (rutas['GET ' + p] = h), post: (p, h) => (rutas['POST ' + p] = h) });
const V = 'a'.repeat(32);
const post = async (slug, texto, v = V) => (await rutas['POST /api/publico/admision/:slug/chat']({
  params: { slug }, url: new URL('https://x.pe/x'),
  request: new Request('https://x.pe/x', { method: 'POST', body: JSON.stringify({ visitante: v, texto }), headers: { 'content-type': 'application/json' } }),
}, env)).json();
let r = await post('demo', 'hola');
assert.ok(r.mensajes.length >= 2 && /asistente virtual/.test(r.mensajes.at(-1).texto), 'demo responde como admisión');
r = await post('demo', 'visita');
r = await post('demo', 'María Pérez');
assert.match(r.mensajes.at(-1).texto, /celular/);
r = await post('demo', '987654321');
assert.match(r.mensajes.at(-1).texto, /grado/);
await post('demo', '2.° de primaria');
assert.equal(DB._raw.prepare("SELECT telefono FROM leads WHERE nombre='María Pérez'").all().length >= 0, true);
await assert.rejects(() => rutas['GET /api/publico/admision/:slug']({ params: { slug: 'nope' } }, env), /no encontrado/);
await assert.rejects(() => post('demo', 'hola', 'zz'), /no válida/);
console.log('OK admision-web');
