import { crearDB } from './d1shim.mjs';
import assert from 'node:assert/strict';
import { Router } from '../src/lib/http.js';
import { rutasAutomatizacion } from '../src/rutas/automatizacion.js';
import { importarCumples, parseFecha, estadoCumples } from '../src/lib/cumples.js';
import { cumpleanios } from '../src/whatsapp/automatizacion.js';

assert.equal(parseFecha('14/05/2016'), '2016-05-14'); assert.equal(parseFecha('2016-5-4'), '2016-05-04');
assert.equal(parseFecha('14/05'), '1900-05-14'); assert.equal(parseFecha('31/02/2016'), null); assert.equal(parseFecha('basura'), null);
assert.equal(parseFecha('01/01/2099'), null);

const DB = crearDB(['migrations/0000_esquema_base.sql', 'migrations/0001_admision_informes_demo.sql', 'migrations/0002_automatizacion.sql', 'migrations/0003_calificar_fotos.sql', 'migrations/0004_calificar_whatsapp.sql', 'migrations/0005_dni_personal.sql']);
const sql = (q) => DB._raw.exec(q);
const uno = (q, ...p) => DB._raw.prepare(q).get(...p);
sql(`INSERT INTO colegios (id, slug, nombre, es_demo, anio_escolar, cumple_auto) VALUES (1,'andes','Colegio Los Andes',0,2026,1)`);
sql(`INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave, telefono) VALUES (1,1,'María Elena Quispe','d@x.pe','direccion','x','51900000001'),(2,1,'Luis Mena','s@x.pe','secretaria','x',NULL)`);
sql(`INSERT INTO personal (id, colegio_id, nombre, cargo) VALUES (1,1,'Juan Auxiliar','Auxiliar')`);
sql(`INSERT INTO apoderados (id, colegio_id, nombres, apellidos, dni, telefono) VALUES (1,1,'Rosa','Quispe Paz','12345678','51911111111'),(2,1,'Carmen','Rojas Díaz',NULL,NULL),(3,1,'Pedro','Ríos',NULL,'51922222222')`);
sql(`INSERT INTO alumnos (id, colegio_id, codigo, nombres, apellidos, nombre_busqueda, dni, nivel, grado, seccion, fecha_nacimiento) VALUES
  (1,1,'AL1','Mateo','Quispe Paz','quispe paz mateo','70000001','Primaria','3° Primaria','A','2016-11-01'),
  (2,1,'AL2','Ana','Rojas Díaz','rojas diaz ana',NULL,'Primaria','3° Primaria','A',NULL)`);
sql(`INSERT INTO alumno_apoderado (alumno_id, apoderado_id, responsable_pago) VALUES (1,1,1),(2,2,1),(2,3,0)`);
sql(`INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio) VALUES (1,1,1,'whatsapp',1,'v1','whatsapp'),(1,3,2,'whatsapp',1,'v1','whatsapp')`);

const env = { DB, URL_BASE: 'https://x.test' };
// por DNI, por nombre (en otro orden), alumno por nombre, personal nuevo con cargo, un desconocido y una fecha mala
const { res, sentencias } = await importarCumples(env, 1, [
  { nombre: '', dni: '12345678', fecha: '1985-05-14' },                                      // Rosa, por DNI
  { nombre: 'Rojas Díaz Carmen', fecha: '03/11/1985', telefono: '987654322' },              // Carmen, por nombre y completa celular
  { nombre: 'Ana Rojas Díaz', fecha: '2016-03-01' },                                         // alumna por nombre
  { nombre: 'Luis Mena', fecha: '1990-07-07', telefono: '987000111', dni: '44556677' },    // usuario: completa celular y dni
  { nombre: 'Rosa Nueva Portera', fecha: '1970-01-01', telefono: '987000222', cargo: 'Portería' },
  { nombre: 'Persona Desconocida', fecha: '1970-01-01' },
  { nombre: 'Pedro Ríos', fecha: '31/02/1980' },
]);
assert.equal(res.actualizados, 4); assert.equal(res.creados, 1); assert.equal(res.sin_fecha, 1);
assert.equal(res.sin_coincidencia.length, 1); assert.equal(res.sin_coincidencia[0].nombre, 'Persona Desconocida');
await DB.batch(sentencias);
assert.equal(uno('SELECT fecha_nacimiento f FROM apoderados WHERE id=1').f, '1985-05-14');
let c = uno('SELECT * FROM apoderados WHERE id=2'); assert.equal(c.fecha_nacimiento, '1985-11-03'); assert.equal(c.telefono, '51987654322');
assert.equal(uno('SELECT fecha_nacimiento f FROM alumnos WHERE id=2').f, '2016-03-01');
c = uno('SELECT * FROM usuarios WHERE id=2'); assert.equal(c.fecha_nacimiento, '1990-07-07'); assert.equal(c.telefono, '51987000111'); assert.equal(c.dni, '44556677');
assert.equal(uno("SELECT telefono t FROM personal WHERE nombre='Rosa Nueva Portera'").t, '51987000222');

// vista previa no escribe
const prev = await importarCumples(env, 1, [{ nombre: 'Pedro Ríos', fecha: '2/2/1980' }], { dry: true });
assert.equal(prev.res.actualizados, 1); assert.equal(prev.sentencias.length, 0);
assert.equal(uno('SELECT fecha_nacimiento f FROM apoderados WHERE id=3').f, null);

// estado: quién queda sin saludo
const e = await estadoCumples(env, 1);
assert.ok(e.sin_saludo.lista.some((x) => x.nombre.includes('Rojas') && x.motivo.includes('autorización')), JSON.stringify(e.sin_saludo));
assert.ok(e.sin_fecha.lista.some((x) => x.nombre.includes('Juan Auxiliar')));
assert.ok(e.sin_fecha.lista.some((x) => x.nombre.includes('Pedro')));

// nombre repetido sin DNI: no adivina
sql(`INSERT INTO apoderados (id, colegio_id, nombres, apellidos) VALUES (10,1,'Luis','Torres'),(11,1,'Luis','Torres')`);
const amb = await importarCumples(env, 1, [{ nombre: 'Luis Torres', fecha: '1/1/1980' }]);
assert.equal(amb.res.ambiguos.length, 1); assert.equal(amb.res.actualizados, 0);

// el saludo sale solo (sin aprobación) el día del cumpleaños para quien tiene fecha y celular
sql(`UPDATE apoderados SET fecha_nacimiento='1985-12-24' WHERE id=1`);
sql(`UPDATE personal SET telefono='51933333333', fecha_nacimiento='1990-12-24' WHERE id=1`);
await cumpleanios(env, '2026-12-24');
const cola = DB._raw.prepare('SELECT telefono FROM wa_cola').all().map((x) => x.telefono);
assert.ok(cola.includes('51911111111') && cola.includes('51933333333'), cola.join());

// ruta de la foto del DNI con IA simulada
const r = new Router(); rutasAutomatizacion(r);
const envIA = { ...env, AI: { run: async () => ({ response: '{"nombres":"Rosa","apellidos":"Quispe Paz","dni":"12345678","fecha_nacimiento":"1985-05-14"}' }) } };
const m = r.buscar('POST', '/api/cumpleanos/dni');
const request = new Request('https://x.test/api/cumpleanos/dni', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array([1, 2, 3]) });
const resp = await m.manejador({ request, url: new URL(request.url), params: {}, usuario: { id: 1, rol: 'direccion', colegio_id: 1 }, colegioId: 1, waitUntil: () => {} }, envIA);
const out = await resp.json();
assert.equal(out.dni, '12345678'); assert.equal(out.fecha, '1985-05-14'); assert.match(out.persona, /Rosa/);
console.log('cumpleaños: todo bien');
