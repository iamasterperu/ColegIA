// Panel del dueño, enlaces para crear contraseña, puesto en el ingreso y colegios suspendidos.
import { crearDB } from './d1shim.mjs';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const migraciones = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => `migrations/${f}`);
const DB = crearDB(migraciones);
const { default: app } = await import('../src/index.js');
const env = { DB, URL_BASE: 'https://colegia.test', MASTER_KEY: Buffer.alloc(32, 7).toString('base64') };
const sql = (q) => DB._raw.exec(q);
const uno = (q, ...p) => DB._raw.prepare(q).get(...p);
const sha = (t) => createHash('sha256').update(t).digest('hex');
const ctxW = { waitUntil() {} };
async function llamar(metodo, ruta, datos, cookie) {
  const r = await app.fetch(new Request(`https://colegia.test${ruta}`, { method: metodo, headers: { 'content-type': 'application/json', 'x-colegia': '1', ...(cookie ? { cookie } : {}) }, body: datos ? JSON.stringify(datos) : undefined }), env, ctxW);
  return { estado: r.status, datos: await r.json().catch(() => ({})), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

// Dueño: activación con enlace de un solo uso
sql("INSERT INTO duenos (id, nombre, email) VALUES (1, 'Dueño', 'dueno@x.pe')");
const tok = 'ab'.repeat(24);
sql(`INSERT INTO invitaciones (id, tipo, ref_id, expira) VALUES ('${sha(tok)}', 'dueno', 1, datetime('now', '+1 day'))`);
assert.equal((await llamar('GET', '/api/dueno/colegios')).estado, 401, 'sin sesión no entra');
assert.equal((await llamar('POST', '/api/dueno/activar', { token: tok, clave: 'corta' })).estado, 400);
const act = await llamar('POST', '/api/dueno/activar', { token: tok, clave: 'Panel2026ok' });
assert.equal(act.estado, 200);
assert.equal((await llamar('POST', '/api/dueno/activar', { token: tok, clave: 'Panel2026ok' })).estado, 404, 'el enlace se usa una sola vez');
const D = act.cookie;
assert.equal((await llamar('GET', '/api/dueno/yo', null, D)).datos.dueno.email, 'dueno@x.pe');
assert.equal((await llamar('POST', '/api/dueno/login', { email: 'dueno@x.pe', clave: 'mala1234' })).estado, 401);
assert.equal((await llamar('POST', '/api/dueno/login', { email: 'dueno@x.pe', clave: 'Panel2026ok' })).estado, 200);

// Un usuario de colegio no puede entrar al panel del dueño
const nuevo = await llamar('POST', '/api/dueno/colegios', { nombre: 'Colegio Santa Rosa', slug: 'santarosa', director_nombre: 'Marta Díaz', director_email: 'marta@sr.pe' }, D);
assert.equal(nuevo.estado, 201);
const inv = nuevo.datos.enlace.split('inv=')[1];
assert.equal((await llamar('GET', '/api/publico/colegios')).datos.colegios.some((c) => c.slug === 'santarosa'), true);
assert.equal((await llamar('POST', '/api/login', { colegio: 'santarosa', email: 'marta@sr.pe', clave: 'pendiente' })).estado, 401, 'sin contraseña no entra');
assert.equal((await llamar('GET', `/api/publico/invitacion/${inv}`)).datos.rol, 'direccion');
assert.equal((await llamar('POST', `/api/publico/invitacion/${inv}`, { clave: 'Marta2026ok' })).estado, 200);
assert.equal((await llamar('POST', `/api/publico/invitacion/${inv}`, { clave: 'Marta2026ok' })).estado, 404);

// Ingreso con puesto: debe coincidir con el de la cuenta
assert.equal((await llamar('POST', '/api/login', { colegio: 'santarosa', email: 'marta@sr.pe', clave: 'Marta2026ok', rol: 'profesor' })).estado, 401);
const ok = await llamar('POST', '/api/login', { colegio: 'santarosa', email: 'marta@sr.pe', clave: 'Marta2026ok', rol: 'direccion', recordar: true });
assert.equal(ok.estado, 200);
assert.match((await app.fetch(new Request('https://colegia.test/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-colegia': '1' }, body: JSON.stringify({ colegio: 'santarosa', email: 'marta@sr.pe', clave: 'Marta2026ok', rol: 'direccion', recordar: true }) }), env, ctxW)).headers.get('set-cookie'), /Max-Age=5184000/, 'sesión recordada de 60 días');
assert.equal((await llamar('GET', '/api/yo', null, ok.cookie)).estado, 200);

// La directora crea otro usuario sin contraseña → enlace
const crea = await llamar('POST', '/api/usuarios', { nombre: 'Rosa Secre', email: 'rosa@sr.pe', rol: 'secretaria' }, ok.cookie);
assert.equal(crea.estado, 201); assert.ok(crea.datos.enlace.includes('/entrar?inv='));

// Suspender corta el acceso y las sesiones abiertas
const id = uno("SELECT id FROM colegios WHERE slug = 'santarosa'").id;
assert.equal((await llamar('PUT', `/api/dueno/colegios/${id}`, { suspendido: true }, D)).estado, 200);
assert.equal((await llamar('GET', '/api/yo', null, ok.cookie)).estado, 401);
assert.equal((await llamar('POST', '/api/login', { colegio: 'santarosa', email: 'marta@sr.pe', clave: 'Marta2026ok' })).estado, 403);
assert.equal((await llamar('GET', '/api/publico/colegios')).datos.colegios.some((c) => c.slug === 'santarosa'), false);
console.log('dueño: todo bien');
