import { crearDB } from './d1shim.mjs';
import assert from 'node:assert/strict';
import { avisarNotas, diaYHora } from '../src/lib/avisos-nota.js';

const DB = crearDB(['migrations/0000_esquema_base.sql', 'migrations/0001_admision_informes_demo.sql', 'migrations/0002_automatizacion.sql', 'migrations/0003_calificar_fotos.sql', 'migrations/0004_calificar_whatsapp.sql', 'migrations/0005_dni_personal.sql']);
const sql = (q) => DB._raw.exec(q);
sql(`INSERT INTO colegios (id, slug, nombre, es_demo, anio_escolar) VALUES (1,'andes','Colegio Los Andes',0,2026)`);
sql(`INSERT INTO apoderados (id, colegio_id, nombres, apellidos, telefono) VALUES (1,1,'Rosa','Quispe','51911111111'),(2,1,'Pedro','Ríos',NULL)`);
sql(`INSERT INTO alumnos (id, colegio_id, codigo, nombres, apellidos, nombre_busqueda, nivel, grado, seccion) VALUES (1,1,'A1','Mateo','Quispe','quispe mateo','Primaria','3° Primaria','A'),(2,1,'A2','Ana','Ríos','rios ana','Primaria','3° Primaria','A')`);
sql(`INSERT INTO alumno_apoderado (alumno_id, apoderado_id, responsable_pago) VALUES (1,1,1),(2,2,1)`);

const h = diaYHora(new Date('2026-11-04T20:10:00Z'));
assert.deepEqual(h, { dia: 'miércoles', fecha: '04/11/2026', hora: '15:10' });

const n = await avisarNotas({ DB }, 1, null, [{ alumno_id: 1, curso: 'Matemática', bimestre: 4, nota: '17' }, { alumno_id: 2, curso: 'Matemática', bimestre: 4, nota: '12' }]);
assert.equal(n, 1, 'solo avisa a quien tiene celular en la app');
const m = DB._raw.prepare("SELECT texto, motivo FROM mensajes WHERE apoderado_id = 1").get();
assert.match(m.texto, /Nueva nota de Mateo/); assert.match(m.texto, /Matemática \(4° bimestre\)/); assert.match(m.texto, /Nota: 17/); assert.match(m.texto, /a las \d\d:\d\d/);
assert.equal(await avisarNotas({ DB }, 1, null, []), 0);
console.log('OK avisos de nota');
