import { crearDB } from './d1shim.mjs';
import assert from 'node:assert/strict';
import { procesarEntrante } from '../src/whatsapp/agente.js';
import { cumpleanios, borradoresFiestas, reporteDiario, reporteMensual, construirReporte } from '../src/whatsapp/automatizacion.js';
import { seguimientoReinscripcion } from '../src/whatsapp/reinscripcion.js';
import { emitirPago, guardarConfig } from '../src/lib/nubefact.js';
import { celebraciones, pascua, domingoN } from '../src/lib/fechas.js';
import { responderCarta } from '../src/lib/carta.js';
import { respuestaPieza } from '../src/lib/plantillas.js';
import { leerWeb } from '../src/ia/fuentes.js';

const DB = crearDB(['migrations/0000_esquema_base.sql', 'migrations/0001_admision_informes_demo.sql', 'migrations/0002_automatizacion.sql']);
const env = { DB, URL_BASE: 'https://colegia.test', MASTER_KEY: Buffer.alloc(32, 7).toString('base64') };
const sql = (q) => DB._raw.exec(q);
const uno = (q, ...p) => DB._raw.prepare(q).get(...p);
const todos = (q, ...p) => DB._raw.prepare(q).all(...p);
const HOY = '2026-05-09'; // sábado antes del Día de la Madre (10 de mayo)

// ---- fechas ----
assert.equal(pascua(2026), '2026-04-05');
assert.equal(domingoN(2026, 5, 2), '2026-05-10');
assert.equal(celebraciones(2026).find((c) => c.clave === 'dia_padre').fecha, '2026-06-21');
assert.equal(celebraciones(2026).find((c) => c.clave === 'viernes_santo').fecha, '2026-04-03');

sql(`INSERT INTO colegios (id, slug, nombre, es_demo, direccion, telefono, color_primario, color_secundario, ruc, anio_escolar, cumple_auto, fiestas_auto, reporte_auto, asistencia_reporte,
       nbf_ruta, nbf_serie_boleta, nbf_serie_factura) VALUES (1,'andes','Colegio Los Andes',0,'Av. Lima 123, Chorrillos','014445566','#0b6e4f','#f2a900','20123456786',2026,1,1,1,1,
       'https://api.nubefact.com/api/v1/abc-123','B001','F001')`);
sql(`INSERT INTO info_colegio (colegio_id, clave, valor) VALUES (1,'admision_activa','1'),(1,'pension','Pensión S/ 520'),(1,'horarios','Primaria 7:45-14:30'),(1,'presentacion','Valores, inglés y talleres de arte.')`);
sql(`INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave, telefono, fecha_nacimiento) VALUES
  (1,1,'Ana Torres','d@x.pe','direccion','x','51900000001','1975-05-09'),
  (2,1,'Luis Mena','s@x.pe','secretaria','x','51900000002',NULL),
  (3,1,'Carla Ruiz','p@x.pe','profesor','x','51900000003',NULL),
  (4,1,'Rosa Quispe','r@x.pe','padre','x',NULL,NULL),
  (5,1,'Pedro Cont','c@x.pe','contabilidad','x','51900000005',NULL)`);
sql(`INSERT INTO personal (colegio_id, nombre, cargo, telefono, fecha_nacimiento) VALUES (1,'Juan Auxiliar','Auxiliar','51900000009','1990-05-09')`);
sql(`INSERT INTO apoderados (id, colegio_id, nombres, apellidos, dni, telefono, fecha_nacimiento) VALUES (1,1,'Rosa','Quispe','12345678','51911111111','1985-05-09')`);
sql(`INSERT INTO alumnos (id, colegio_id, codigo, nombres, apellidos, nombre_busqueda, nivel, grado, seccion, fecha_nacimiento) VALUES
  (1,1,'AL0001','Mateo','Quispe','quispe mateo','Primaria','3° Primaria','A','2016-05-09'),
  (2,1,'AL0002','Ana','Paz','paz ana','Primaria','3° Primaria','A','2016-03-01'),
  (3,1,'AL0003','Luis','Ríos','rios luis','Primaria','3° Primaria','A','2016-01-01')`);
sql(`INSERT INTO alumno_apoderado (alumno_id, apoderado_id, responsable_pago) VALUES (1,1,1),(2,1,0)`);
sql(`INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio) VALUES (1,1,1,'whatsapp',1,'v1','whatsapp'),(1,1,2,'whatsapp',1,'v1','whatsapp')`);
sql(`INSERT INTO profesor_secciones (usuario_id, grado, seccion, curso) VALUES (3,'3° Primaria','A','Matemática')`);

const colegio = uno('SELECT * FROM colegios WHERE id=1');
const conexion = { colegio, modo: 'simulado', numerosPrueba: [] };
const dice = async (tel, texto, extra = {}) => (await procesarEntrante(env, conexion, { telefono: tel, texto, tipo: 'texto', ...extra })).map((x) => x.texto).join(' | ');

// ---- toma de lista por WhatsApp ----
let r = await dice('51900000003', 'lista');
assert.match(r, /Lista de 3° Primaria A/); assert.match(r, /1\. Paz Ana/);
r = await dice('51900000003', 'faltan 2 tarde 3');
assert.match(r, /Faltaron: Mateo Quispe/); assert.match(r, /Tarde: Luis Ríos/);
r = await dice('51900000003', 'si'); assert.match(r, /Lista de 3° Primaria A guardada: 1 presentes, 1 falta/);
assert.equal(uno("SELECT estado FROM asistencia_diaria WHERE alumno_id=1").estado, 'falta');
assert.equal(uno("SELECT faltas FROM asistencia WHERE alumno_id=1").faltas, 1);
assert.ok(uno('SELECT 1 x FROM mensajes WHERE telefono=? AND motivo=?', '51911111111', 'aviso'), 'avisa al apoderado de la falta');
// corregir la lista el mismo día no suma dos veces
await dice('51900000003', 'lista'); await dice('51900000003', 'faltan 2 tarde 3'); await dice('51900000003', 'si');
assert.equal(uno("SELECT faltas FROM asistencia WHERE alumno_id=1").faltas, 1, 'corregir no duplica');
await dice('51900000003', 'lista'); await dice('51900000003', 'todos'); r = await dice('51900000003', 'si');
assert.equal(uno("SELECT faltas FROM asistencia WHERE alumno_id=1").faltas, 0, 'al corregir a presente baja la falta');

// ---- examen desde web (registro en documentos) ----
sql(`INSERT INTO documentos (colegio_id, usuario_id, tipo, titulo, grado, curso, contenido, token, fuente) VALUES (1,3,'examen','Fracciones','3° Primaria','Matemática','{}','tok1','web')`);

// ---- reporte diario ----
await dice('51900000003', 'lista'); await dice('51900000003', 'faltan 1'); await dice('51900000003', 'si');
const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
const nRep = await reporteDiario(env, hoy);
if (dia >= 1 && dia <= 5) { assert.ok(nRep >= 1); assert.match(uno("SELECT texto FROM wa_cola WHERE motivo='reporte' ORDER BY id DESC").texto, /Asistencia: .*presentes/); }

// ---- cumpleaños ----
const n = await cumpleanios(env, HOY);
assert.ok(n >= 4, `cumpleaños encolados: ${n}`);
const cumples = todos("SELECT telefono, texto FROM wa_cola WHERE motivo='cumple'");
assert.ok(cumples.some((c) => c.telefono === '51911111111' && /Mateo/.test(c.texto)), 'papá recibe el saludo del hijo');
assert.ok(cumples.some((c) => c.telefono === '51900000001'), 'directora');
assert.ok(cumples.some((c) => c.telefono === '51900000009'), 'personal sin acceso');
assert.equal(todos("SELECT 1 FROM piezas WHERE tipo='cumple'").length >= 4, true);
assert.equal(await cumpleanios(env, HOY), 0, 'no repite el mismo día');

// ---- comunicado por fiesta con aprobación ----
const b = await borradoresFiestas(env, HOY);
assert.equal(b, 1, 'borrador del Día de la Madre');
const borr = uno('SELECT * FROM borradores');
assert.match(borr.titulo, /Madre/);
const aviso = todos("SELECT telefono FROM wa_cola WHERE motivo='borrador'").map((x) => x.telefono).sort();
assert.deepEqual(aviso, ['51900000001', '51900000002'], 'el borrador solo va a dirección y secretaría');
assert.equal(todos("SELECT 1 FROM wa_cola WHERE motivo='comunicado'").length, 0, 'nada masivo antes de aprobar');
assert.equal(await borradoresFiestas(env, HOY), 0);
r = await dice('51900000003', `aprobar ${borr.id}`); assert.doesNotMatch(r, /Aprobado/);
r = await dice('51900000002', `editar ${borr.id}: Feliz día a todas las mamás de nuestra comunidad.`); assert.match(r, /Actualicé/);
r = await dice('51900000002', `aprobar ${borr.id}`); assert.match(r, /Aprobado/);
const masivo = todos("SELECT telefono, texto FROM wa_cola WHERE motivo='comunicado'");
assert.ok(masivo.length >= 5, `masivo a ${masivo.length}`);
assert.ok(masivo.every((m) => /mamás/.test(m.texto) && /colegia\.test\/c\//.test(m.texto)));
assert.ok(masivo.some((m) => m.telefono === '51911111111'));
assert.equal(uno('SELECT estado FROM borradores').estado, 'aprobado');
r = await dice('51900000002', `aprobar ${borr.id}`); assert.match(r, /ya estaba aprobado/);

// ---- página bonita y PDF ----
const pz = uno("SELECT * FROM piezas WHERE tipo='comunicado'"); pz.contenido = JSON.parse(pz.contenido);
const html = await respuestaPieza(pz, colegio, null).text();
assert.match(html, /#0b6e4f/); assert.match(html, /Colegio Los Andes/); assert.match(html, /mamás/);
const pdf = new Uint8Array(await respuestaPieza(pz, colegio, 'pdf').arrayBuffer());
assert.equal(String.fromCharCode(...pdf.slice(0, 5)), '%PDF-');

// ---- carta de presentación pública ----
const carta = await responderCarta(env, 'andes', null);
assert.equal(carta.status, 200);
const ct = await carta.text(); assert.match(ct, /Valores, inglés/); assert.match(ct, /Pensión S\/ 520/); assert.match(ct, /href="\/carta\/andes\/pdf"/);
assert.equal((await responderCarta(env, 'andes', 'pdf')).headers.get('content-type'), 'application/pdf');
assert.equal((await responderCarta(env, 'no-existe', null)).status, 404);

// ---- admisiones: la familia recibe la carta ----
r = await dice('51922222222', 'hola'); r = await dice('51922222222', '4'); r = await dice('51922222222', 'María Pérez'); r = await dice('51922222222', '3 años');
assert.match(r, /carta\/andes|Carta de presentación/, 'sin horarios: aviso con carta');
r = await dice('51900000002', 'invitar'); assert.match(r, /familias interesadas/);
r = await dice('51900000002', 'si'); assert.match(r, /Invitación en camino/);
assert.ok(uno("SELECT 1 x FROM wa_cola WHERE motivo='invitacion' AND telefono='51922222222'"));

// ---- constancia y diploma ----
r = await dice('51900000002', 'constancia Mateo Quispe'); assert.match(r, /constancia de matrícula.*\/c\/[a-f0-9]+\/pdf/s);
r = await dice('51900000002', 'diploma Ana Paz: por su excelente rendimiento'); assert.match(r, /Diploma para Ana Paz/);
const pd = uno("SELECT * FROM piezas WHERE tipo='diploma'"); pd.contenido = JSON.parse(pd.contenido);
assert.equal(String.fromCharCode(...new Uint8Array(await respuestaPieza(pd, colegio, 'pdf').arrayBuffer()).slice(0, 5)), '%PDF-');
r = await dice('51900000003', 'constancia Mateo Quispe'); assert.doesNotMatch(r, /constancia de matrícula/);

// ---- reinscripción ----
r = await dice('51900000001', 'reinscripcion'); assert.match(r, /Todavía no hay una campaña/);
r = await dice('51900000001', 'reinscripcion iniciar'); assert.match(r, /2027/); r = await dice('51900000001', 'si'); assert.match(r, /Campaña de reinscripción 2027 iniciada/);
assert.ok(uno("SELECT 1 x FROM wa_cola WHERE motivo='reinscripcion' AND telefono='51911111111'"));
r = await dice('51911111111', 'REINSCRIBIR'); assert.match(r, /Registramos la reinscripción 2027/);
assert.equal(todos("SELECT estado FROM reinscripciones WHERE estado='confirmada'").length, 2);
r = await dice('51900000001', 'reinscripcion'); assert.match(r, /Confirmaron: 2/);
sql("UPDATE reinscripciones SET aviso_en = datetime('now','-6 days') WHERE alumno_id = 3");
assert.equal(await seguimientoReinscripcion(env), 0, 'Luis no tiene apoderado con permiso: no hay a quién recordar');

// ---- comprobante Nubefact (simulado) ----
sql(`INSERT INTO pagos (id, colegio_id, alumno_id, concepto, periodo, monto_centimos, vencimiento, estado, pagado_en) VALUES (1,1,1,'Pensión','2026-05',52000,'2026-05-05','pagado','2026-05-04')`);
await guardarConfig(env, 1, { token: 'secreto-abc' });
const col2 = uno('SELECT * FROM colegios WHERE id=1');
let enviado;
const falso = async (url, init) => { enviado = { url, init, cuerpo: JSON.parse(init.body) }; return { ok: true, json: async () => ({ serie: 'B001', numero: 1, enlace_del_pdf: 'https://nubefact.test/p.pdf', aceptada_por_sunat: true }) }; };
const c = await emitirPago(env, col2, 1, { tipo: 'boleta', usuarioId: 5 }, falso);
assert.equal(enviado.url, 'https://api.nubefact.com/api/v1/abc-123');
assert.equal(enviado.init.headers.authorization, 'Token token="secreto-abc"');
assert.equal(enviado.cuerpo.tipo_de_comprobante, 2); assert.equal(enviado.cuerpo.cliente_numero_de_documento, '12345678');
assert.equal(enviado.cuerpo.total, 520); assert.equal(enviado.cuerpo.total_inafecta, 520); assert.equal(enviado.cuerpo.items[0].tipo_de_igv, 9);
assert.equal(c.numero, 1);
await assert.rejects(() => emitirPago(env, col2, 1, { tipo: 'boleta' }, falso), /ya tiene comprobante/);
sql(`INSERT INTO pagos (id, colegio_id, alumno_id, concepto, periodo, monto_centimos, vencimiento, estado, pagado_en) VALUES (2,1,2,'Pensión','2026-05',52000,'2026-05-05','pagado','2026-05-04')`);
await assert.rejects(() => emitirPago(env, col2, 2, { tipo: 'factura', ruc: '20123456780', razon: 'Empresa SAC' }, falso), /RUC/);
const f2 = await emitirPago(env, col2, 2, { tipo: 'factura', ruc: '20123456786', razon: 'Empresa SAC', usuarioId: 5 }, falso);
assert.equal(enviado.cuerpo.tipo_de_comprobante, 1); assert.equal(enviado.cuerpo.serie, 'F001'); assert.equal(f2.numero, 1);
const rechazo = async () => ({ ok: false, json: async () => ({ errors: 'serie no existe' }) });
sql(`INSERT INTO pagos (id, colegio_id, alumno_id, concepto, monto_centimos, vencimiento, estado, pagado_en) VALUES (3,1,1,'Matrícula',10000,'2026-03-05','pagado','2026-03-04')`);
await assert.rejects(() => emitirPago(env, col2, 3, { tipo: 'boleta' }, rechazo), /rechazó/);
assert.equal(uno("SELECT estado FROM comprobantes WHERE pago_id=3").estado, 'error');
// por WhatsApp: contabilidad no tiene conexión simulada, solo valida el flujo previo
conexion.colegio = col2;
r = await dice('51900000005', 'boleta Ana Paz'); assert.match(r, /no tiene pagos registrados sin comprobante|Emitiré/);

// ---- reporte mensual ----
const secc = await construirReporte(env, col2, hoy.slice(0, 7));
assert.ok(secc.some((s) => s.titulo === 'Asistencia'));
assert.match(secc.find((s) => s.titulo.startsWith('Exámenes')).lineas.join(' '), /Carla Ruiz: 1 examen/);
assert.ok(JSON.stringify(secc).indexOf('Mateo') === -1, 'el reporte público no lleva nombres de alumnos');
const ultimo = new Date(Date.UTC(2026, 5, 0)).toISOString().slice(0, 10); // 31 mayo
assert.equal(await reporteMensual(env, ultimo), 1);
assert.equal(await reporteMensual(env, ultimo), 0, 'no repite');
assert.equal(todos("SELECT telefono FROM wa_cola WHERE motivo='reporte' AND lote LIKE 'reporte-mes-%'").length, 2);
r = await dice('51900000001', 'reporte'); assert.match(r, /Reporte de .* \(hasta hoy\)/);

// ---- "mi cumpleaños" por WhatsApp ----
r = await dice('51911111111', 'mi cumpleaños 12 de mayo'); assert.match(r, /12 de mayo/);
assert.equal(uno('SELECT fecha_nacimiento f FROM apoderados WHERE id=1').f, '1900-05-12');
r = await dice('51900000003', 'mi cumple 3/11/1988'); assert.match(r, /3 de noviembre/);
assert.equal(uno('SELECT fecha_nacimiento f FROM usuarios WHERE id=3').f, '1988-11-03');
r = await dice('51900000003', 'mi cumpleaños 31 de febrero'); assert.match(r, /Escríbelo así/);

// ---- lectura de página web ----
const html2 = '<html><body><nav>menú</nav><h1>Las fracciones</h1><p>' + 'Una fracción representa partes de un entero. '.repeat(5) + '</p><script>x()</script></body></html>';
const web = await leerWeb('https://ejemplo.pe/fracciones', async () => ({ ok: true, headers: { get: () => 'text/html' }, text: async () => html2 }));
assert.match(web, /Las fracciones/); assert.doesNotMatch(web, /menú|x\(\)/);
await assert.rejects(() => leerWeb('http://ejemplo.pe/a'), /https/);
await assert.rejects(() => leerWeb('https://127.0.0.1/a'), /públicas/);

console.log('automatización: todo bien');
