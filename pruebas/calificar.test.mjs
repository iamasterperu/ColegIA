import { crearDB } from './d1shim.mjs';
import assert from 'node:assert/strict';
import { Router } from '../src/lib/http.js';
import { rutasDocente } from '../src/rutas/docente.js';
import { interpretarLectura, nivelDe } from '../src/lib/calificar.js';
import { radarExamen, alumnosEnRiesgo } from '../src/lib/riesgo.js';

// ---- cálculo de nota, porcentaje y nivel ----
assert.deepEqual(interpretarLectura({ nota_escrita: '15' }, 10), { porcentaje: 75, puntaje: 15, nivel: 'bueno', falladas: null, sin_detalle: 1, nota_escrita: '15' });
assert.equal(interpretarLectura({ nota_escrita: '8/10' }, 10).porcentaje, 80);
assert.equal(interpretarLectura({ nota_escrita: '45%' }, 10).nivel, 'ayuda');
assert.equal(interpretarLectura({ nota_escrita: 'B' }, 10).nivel, 'regular');
assert.equal(interpretarLectura({ nota_escrita: 'AD' }, 10).nivel, 'bueno');
assert.equal(interpretarLectura({ preguntas_incorrectas: [2, 5, 99] }, 10).porcentaje, 80);
assert.deepEqual(interpretarLectura({ preguntas_incorrectas: [2, 5] }, 10).falladas, [2, 5]);
assert.equal(interpretarLectura({ correctas: 6, total: 10 }, 10).puntaje, 12);
assert.equal(interpretarLectura({ nota_escrita: '20' }, 10).falladas.length, 0);
assert.equal(interpretarLectura({ nota_escrita: 'bien' }, 10), null);
assert.equal(nivelDe(69), 'regular'); assert.equal(nivelDe(49), 'ayuda');

// ---- rutas ----
const DB = crearDB(['migrations/0000_esquema_base.sql', 'migrations/0001_admision_informes_demo.sql', 'migrations/0002_automatizacion.sql', 'migrations/0003_calificar_fotos.sql', 'migrations/0004_calificar_whatsapp.sql']);
const sql = (q) => DB._raw.exec(q);
const uno = (q, ...p) => DB._raw.prepare(q).get(...p);
sql(`INSERT INTO colegios (id, slug, nombre, es_demo, anio_escolar) VALUES (1,'andes','Colegio Los Andes',0,2026)`);
sql(`INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave) VALUES (3,1,'Carla Ruiz','p@x.pe','profesor','x'),(4,1,'Otro Prof','o@x.pe','profesor','x'),(5,1,'Dir','d@x.pe','direccion','x')`);
sql(`INSERT INTO alumnos (id, colegio_id, codigo, nombres, apellidos, nombre_busqueda, nivel, grado, seccion, fecha_nacimiento) VALUES
  (1,1,'AL0001','Mateo','Quispe','quispe mateo','Primaria','3° Primaria','A','2016-05-09'),
  (2,1,'AL0002','Ana','Paz','paz ana','Primaria','3° Primaria','A','2016-03-01'),
  (3,1,'AL0003','Luis','Ríos','rios luis','Primaria','4° Primaria','B','2015-01-01')`);
sql(`INSERT INTO profesor_secciones (usuario_id, grado, seccion, curso) VALUES (3,'3° Primaria','A','Matemática')`);
const preguntas = Array.from({ length: 10 }, (_, i) => ({ tema: i < 5 ? 'Sumas' : 'Restas', p: `P${i}`, o: ['a', 'b', 'c', 'd'], c: 0, e: '' }));
sql(`INSERT INTO documentos (id, colegio_id, usuario_id, tipo, titulo, grado, curso, contenido, token, fuente) VALUES (1,1,3,'examen','Fracciones','3° Primaria','Matemática','${JSON.stringify({ preguntas })}','tok1','web')`);

const r = new Router(); rutasDocente(r);
const lecturas = [];
const env = { DB, AI: { run: async () => ({ response: lecturas.shift() }) } };
const llamar = async (metodo, ruta, usuario, cuerpo, tipo = 'application/json') => {
  const m = r.buscar(metodo, ruta);
  assert.ok(m, `sin ruta ${metodo} ${ruta}`);
  const esJson = tipo === 'application/json';
  const request = new Request('https://x.test' + ruta, { method: metodo, headers: { 'content-type': tipo }, body: metodo === 'GET' ? undefined : esJson ? JSON.stringify(cuerpo) : cuerpo });
  const ctx = { request, url: new URL(request.url), params: m.params, usuario, colegioId: 1, waitUntil: () => {} };
  try { const resp = await m.manejador(ctx, env); return { estado: resp.status, datos: await resp.json() }; } catch (e) { return { estado: e.estado, datos: { error: e.message } }; }
};
const prof = { id: 3, rol: 'profesor', colegio_id: 1, nombre: 'Carla' };
const otro = { id: 4, rol: 'profesor', colegio_id: 1, nombre: 'Otro' };
const dir = { id: 5, rol: 'direccion', colegio_id: 1, nombre: 'Dir' };

// el profesor solo ve alumnos de sus secciones
let x = await llamar('GET', '/api/documentos/1/aula', prof);
assert.deepEqual(x.datos.map((a) => a.id).sort(), [1, 2]);

// guardar resultados: nota 15/20 de Mateo (sin detalle) y 2 falladas de Ana; Luis no es de su aula
x = await llamar('POST', '/api/documentos/1/resultados', prof, { guardar_nota: true, filas: [
  { alumno_id: 1, porcentaje: 75, falladas: null }, { alumno_id: 2, porcentaje: 20, falladas: [1, 2, 3, 4, 5, 6, 7, 8] }, { alumno_id: 3, porcentaje: 90, falladas: [] }] });
assert.equal(x.estado, 200); assert.equal(x.datos.guardados, 2);
assert.deepEqual(x.datos.nota_bimestre.curso, 'Matemática');
let f = uno('SELECT * FROM examen_resultados WHERE alumno_id=1');
assert.equal(f.puntaje, 15); assert.equal(f.porcentaje, 75); assert.equal(f.nivel, 'bueno'); assert.equal(f.sin_detalle, 1); assert.equal(f.origen, 'foto');
f = uno('SELECT * FROM examen_resultados WHERE alumno_id=2'); assert.equal(f.nivel, 'ayuda'); assert.equal(f.sin_detalle, 0); assert.equal(f.puntaje, 4);
assert.equal(uno('SELECT COUNT(*) n FROM examen_resultados WHERE alumno_id=3').n, 0);
assert.equal(uno("SELECT nota n FROM notas WHERE alumno_id=1 AND curso='Matemática'").n, '15');

// otro profesor no puede registrar en alumnos que no son suyos
x = await llamar('POST', '/api/documentos/1/resultados', otro, { filas: [{ alumno_id: 1, porcentaje: 50 }] });
assert.equal(x.estado, 400);
// porcentaje inválido
x = await llamar('POST', '/api/documentos/1/resultados', dir, { filas: [{ alumno_id: 1, porcentaje: 150 }] });
assert.equal(x.estado, 400);

// radar: el que no tiene detalle no cuenta en los temas; el riesgo sí lo detecta
const radar = await radarExamen(env, { id: 1, contenido: { preguntas } });
assert.equal(radar.temas.find((t) => t.tema === 'Sumas').intentos, 5);
assert.equal(radar.alumnos.length, 2);
sql(`UPDATE examen_resultados SET falladas='[]', sin_detalle=1, porcentaje=30, nivel='ayuda' WHERE alumno_id=2`);
const riesgo = await alumnosEnRiesgo(env, 1, { sql: '1 = 1', params: [] });
assert.ok(riesgo.find((a) => a.id === 2)?.motivos.some((m) => /30%/.test(m)));

// calificar foto con IA simulada
lecturas.push('{"alumno":"Ana Paz","nota_escrita":"7/10","correctas":null,"total":null,"preguntas_incorrectas":null}');
x = await llamar('POST', '/api/documentos/1/calificar-foto', prof, new Uint8Array([255, 216, 255, 1, 2, 3]), 'image/jpeg');
assert.equal(x.estado, 200); assert.equal(x.datos.alumno, 'Ana Paz');
// agrupar: 3 hojas de Mateo (solo la primera con nombre) + 1 de Ana
x = await llamar('POST', '/api/documentos/1/agrupar', prof, { lecturas: [
  { alumno: 'Mateo Quispe', pagina: 1, nota_escrita: '15', es_nota_final: true }, { alumno: null, pagina: 2 }, { alumno: null, pagina: 3 },
  { alumno: 'Ana Paz', nota_escrita: '7/10' }] });
assert.equal(x.estado, 200); assert.equal(x.datos.length, 2);
assert.deepEqual(x.datos[0].fotos, [1, 2, 3]); assert.equal(x.datos[0].alumno_id, 1); assert.equal(x.datos[0].puntaje, 15);
assert.equal(x.datos[1].alumno_id, 2); assert.equal(x.datos[1].porcentaje, 70); assert.equal(x.datos[1].nivel, 'bueno');
// notas distintas sin nota final: conflicto, no se inventa nada
x = await llamar('POST', '/api/documentos/1/agrupar', prof, { lecturas: [{ alumno: 'Ana Paz', nota_escrita: '5' }, { alumno: null, nota_escrita: '8' }] });
assert.deepEqual(x.datos[0].conflicto, ['5', '8']); assert.equal(x.datos[0].leido, false);
x = await llamar('POST', '/api/documentos/1/calificar-foto', prof, '{}', 'application/json');
assert.equal(x.estado, 415);

// crear un examen con material de origen
x = await llamar('POST', '/api/documentos/fuente', prof, '%PDF-1.4', 'text/plain');
assert.equal(x.estado, 415);
x = await llamar('POST', '/api/documentos/fuente', prof, { url: 'http://malo.pe' });
assert.equal(x.estado, 400);


// ---- WhatsApp: examen de varias hojas por alumno ----
import { procesarEntrante } from '../src/whatsapp/agente.js';
const HOJAS = {
  m1: { alumno: 'Mateo Quispe', pagina: 1, nota_escrita: '16', es_nota_final: true },
  m2: { alumno: null, pagina: 2, nota_escrita: null, preguntas_incorrectas: null },
  m3: { alumno: null, pagina: 3, nota_escrita: null },
  a1: { alumno: 'Ana Paz', pagina: 1, nota_escrita: null, preguntas_incorrectas: [1, 2, 3, 4, 5, 6] },
  a2: { alumno: null, pagina: 2, preguntas_incorrectas: [7, 9] },
  x1: { alumno: 'Pepito Desconocido', pagina: 1, nota_escrita: '12' },
};
const envWa = { DB, AI: { run: async (_m, entrada) => {
  const url = entrada.messages[0].content[1].image_url.url;
  const clave = Buffer.from(url.split(',')[1], 'base64').toString();
  if (clave === 'mala') throw new Error('no se lee');
  return { response: JSON.stringify(HOJAS[clave]) };
} } };
sql(`INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave, telefono) VALUES (9,1,'Carla Prof','cp@x.pe','profesor','x','51900000003')`);
sql(`INSERT INTO profesor_secciones (usuario_id, grado, seccion, curso) VALUES (9,'3° Primaria','A','Matemática')`);
sql('DELETE FROM examen_resultados');
const colegioWa = uno('SELECT * FROM colegios WHERE id=1');
const conexion = { colegio: colegioWa, modo: 'simulado', numerosPrueba: [] };
const dice = async (texto) => (await procesarEntrante(envWa, conexion, { telefono: '51900000003', texto, tipo: 'texto' })).map((x) => x.texto).join(' | ');
const foto = async (clave, ts, texto = '') => (await procesarEntrante(envWa, conexion, { telefono: '51900000003', texto, tipo: 'imagen', imagen: { mime: 'image/jpeg', datos: new TextEncoder().encode(clave).buffer }, ts, waId: 'w' + clave + ts })).map((x) => x.texto).join(' | ');

let t = await dice('calificar 1');
assert.match(t, /Fracciones|código 1/);
// las fotos llegan a la vez y desordenadas, pero el orden de WhatsApp (ts) manda
const acks = await Promise.all([foto('m2', 1002), foto('a1', 1004), foto('m1', 1001), foto('a2', 1005), foto('m3', 1003)]);
assert.ok(acks.every((a) => /Foto \d/.test(a)), acks.join('\n'));
t = await dice('listo');
assert.match(t, /Mateo Quispe\* \(fotos 1-3\): 16\/20 · 80%/, t);
assert.match(t, /Ana Paz\* \(fotos 4-5\): 4\/20 · 20%/, t);
assert.match(t, /Responde \*SI\*/);
// una foto ilegible se avisa y no se guarda como hoja
t = await foto('mala', 1006);
assert.match(t, /no se pudo leer/);
// hoja de alguien que no es de su aula
await foto('x1', 1007);
t = await dice('listo');
assert.match(t, /Pepito Desconocido|no reconocí/);
assert.match(t, /foto 6: Nombre/);
// corrección: quitar las 2 últimas
await dice('quitar foto 7'); await dice('quitar foto 6');
t = await dice('listo');
assert.doesNotMatch(t, /no reconocí/);
t = await dice('si');
assert.match(t, /Guardé 2 resultado/, t);
const m = uno('SELECT * FROM examen_resultados WHERE alumno_id=1'); assert.equal(m.puntaje, 16); assert.equal(m.nivel, 'bueno'); assert.equal(m.origen, 'whatsapp');
const a = uno('SELECT * FROM examen_resultados WHERE alumno_id=2'); assert.equal(a.sin_detalle, 0); assert.deepEqual(JSON.parse(a.falladas), [1, 2, 3, 4, 5, 6, 7, 9]); assert.equal(a.porcentaje, 20);
assert.equal(a.nivel, 'ayuda');
assert.equal(uno('SELECT COUNT(*) n FROM calif_fotos').n, 0);

// cancelar
await dice('calificar 1'); await foto('m1', 2000);
t = await dice('cancelar'); assert.match(t, /Cancelado/);
assert.equal(uno('SELECT COUNT(*) n FROM calif_fotos').n, 0);

// sin escribir 'calificar': basta la palabra en el pie de la foto, y las siguientes fotos sin texto se unen a la misma sesión
t = await foto('m1', 3000, 'examen revisado 1'); assert.match(t, /Foto 1: «Mateo Quispe», hoja 1/);
t = await foto('m2', 3001); assert.match(t, /Foto 2: sin nombre/);
await dice('cancelar');
console.log('calificar: todo bien');
