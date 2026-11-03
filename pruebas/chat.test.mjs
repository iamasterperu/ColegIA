import { crearDB } from './d1shim.mjs';
import { rutasChat } from '../src/rutas/chat.js';
import assert from 'node:assert/strict';

const DB = crearDB(['migrations/0000_esquema_base.sql', 'migrations/0001_admision_informes_demo.sql']);
const env = { DB };
DB._raw.exec(`INSERT INTO colegios (id, slug, nombre, es_demo) VALUES (1,'demo','Colegio Demo',1),(2,'real','Colegio Real',0)`);
DB._raw.exec(`INSERT INTO apoderados (id, colegio_id, nombres, apellidos, telefono) VALUES (1,2,'Rosa','Quispe','911111111');
  INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave, apoderado_id, telefono) VALUES
  (1,1,'Ana Torres','d@x.pe','direccion','x',NULL,NULL),
  (2,2,'Rosa Quispe','p@x.pe','padre','x',1,NULL),
  (3,2,'Luis Gómez','l@x.pe','profesor','x',NULL,NULL);`);
const rutas = {};
rutasChat({ get: (p, h) => (rutas['GET ' + p] = h), post: (p, h) => (rutas['POST ' + p] = h) });
const ctx = (u, cuerpo) => ({
  usuario: u, colegioId: u.colegio_id, url: new URL('https://x.pe/api/chat'), waitUntil() {},
  request: new Request('https://x.pe/api/chat', { method: 'POST', body: JSON.stringify(cuerpo || {}), headers: { 'content-type': 'application/json' } }),
});
const leer = async (r) => r.json();

// demo: sin celular → línea interna con rol de su cuenta
let r = await leer(await rutas['POST /api/chat'](ctx({ id: 1, colegio_id: 1, rol: 'direccion' }, { texto: 'hola' }), env));
assert.ok(r.mensajes.length >= 2, 'entrante + respuesta');
// historial incremental
const h = await leer(await rutas['GET /api/chat/historial'](ctx({ id: 1, colegio_id: 1, rol: 'direccion' }), env));
assert.equal(h.length, r.mensajes.length);
// padre con celular de apoderado, colegio real
r = await leer(await rutas['POST /api/chat'](ctx({ id: 2, colegio_id: 2, rol: 'padre' }, { texto: 'hola' }), env));
assert.ok(r.mensajes.length >= 2);
assert.ok(DB._raw.prepare("SELECT COUNT(*) n FROM mensajes WHERE telefono='51988000002'").get().n >= 2);
// profesor sin celular en colegio real → funciona igual (la identidad es la sesión)
r = await leer(await rutas['POST /api/chat'](ctx({ id: 3, colegio_id: 2, rol: 'profesor' }, { texto: 'hola' }), env));
assert.ok(r.mensajes.length >= 2, 'profesor sin celular también chatea');
// sin sesión
await assert.rejects(() => rutas['GET /api/chat/historial']({ usuario: null, url: new URL('https://x.pe/') }, env), /Inicia sesión/);
console.log('OK chat');
