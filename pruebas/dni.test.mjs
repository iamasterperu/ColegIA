import { crearDB } from './d1shim.mjs';
import { readdirSync } from 'node:fs';
import { rutasIngresoDni } from '../src/rutas/ingreso-dni.js';
import assert from 'node:assert/strict';
const DB = crearDB(readdirSync('migrations').sort().map((f) => 'migrations/' + f));
const env = { DB };
DB._raw.exec(`INSERT INTO colegios (id, slug, nombre) VALUES (1,'cole','Cole');
 INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave, dni, telefono) VALUES (1,1,'Ana Directora','a@x.pe','direccion','x','11111111','987000001');
 INSERT INTO apoderados (id, colegio_id, nombres, apellidos, dni, telefono) VALUES (1,1,'Rosa','Quispe','22222222','987000002'),(2,1,'Sin','Hijo','33333333','987000003');
 INSERT INTO alumnos (id, colegio_id, codigo, nombres, apellidos, nombre_busqueda, nivel, grado, seccion, estado) VALUES (1,1,'A1','Luz','Quispe','luz quispe','Primaria','2','A','matriculado');
 INSERT INTO alumno_apoderado (alumno_id, apoderado_id) VALUES (1,1);`);
let ruta; rutasIngresoDni({ post: (p, h) => (ruta = h) });
const go = async (d) => ruta({ request: new Request('https://x.pe/x', { method: 'POST', body: JSON.stringify(d), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' } }) }, env);
let r = await go({ colegio: 'cole', dni: '11111111', celular: '987000001' });
assert.equal((await r.json()).rol, 'direccion'); assert.match(r.headers.get('set-cookie'), /colegia_sesion/);
r = await go({ colegio: 'cole', dni: '22222222', celular: '987 000 002' });
assert.equal((await r.json()).rol, 'padre', 'familia detectada y cuenta creada');
assert.equal(DB._raw.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='padre'").get().n, 1);
await go({ colegio: 'cole', dni: '22222222', celular: '987000002' }); // segunda vez: misma cuenta
assert.equal(DB._raw.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='padre'").get().n, 1);
await assert.rejects(() => go({ colegio: 'cole', dni: '11111111', celular: '999999999' }), /No encontramos/); // DNI con otro celular
await assert.rejects(() => go({ colegio: 'cole', dni: '33333333', celular: '987000003' }), /No encontramos/); // sin hijo matriculado
for (let i = 0; i < 5; i++) await go({ colegio: 'cole', dni: '44444444', celular: '911111111' }).catch(() => {});
await assert.rejects(() => go({ colegio: 'cole', dni: '44444444', celular: '911111111' }), /Demasiados/);
console.log('OK dni');
