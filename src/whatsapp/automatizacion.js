// Tareas automáticas del colegio (las dispara el cron cada hora): cumpleaños, comunicados por
// fiestas con aprobación, reporte diario de asistencia y reporte mensual para dirección y secretaría.
import { hoyLima, soles } from '../lib/http.js';
import { proximas, textoBase } from '../lib/fechas.js';
import { guardarPieza, enlacePieza, fechaLarga } from '../lib/plantillas.js';
import { resumenAsistenciaDia } from '../lib/asistencia.js';
import { generarTexto, hayIA } from '../ia/modelo.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';
import { apoderadosConPermiso, encolar } from './comun.js';

const origen = (env) => env.URL_BASE || '';
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const fmt = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

// ---- Destinatarios ----
export async function personalConTelefono(env, colegioId, roles = null) {
  const { results } = await env.DB.prepare(
    `SELECT id, nombre, telefono, rol FROM usuarios WHERE colegio_id = ? AND rol != 'padre' AND activo = 1 AND telefono IS NOT NULL${roles ? ` AND rol IN (${roles.map(() => '?').join(',')})` : ''}`,
  ).bind(colegioId, ...(roles || [])).all();
  return results;
}

// Todas las familias con autorización de WhatsApp, más el personal que tiene celular registrado
export async function destinatariosTodos(env, colegio) {
  const familias = await apoderadosConPermiso(env, colegio, '1 = 1', []);
  const [usuarios, { results: personal }] = [await personalConTelefono(env, colegio.id),
    await env.DB.prepare('SELECT nombre, telefono FROM personal WHERE colegio_id = ? AND activo = 1 AND telefono IS NOT NULL').bind(colegio.id).all()];
  const vistos = new Set();
  const salida = [];
  for (const d of [...familias, ...usuarios.map((u) => ({ telefono: u.telefono, nombres: u.nombre })), ...personal.map((u) => ({ telefono: u.telefono, nombres: u.nombre }))]) {
    if (vistos.has(d.telefono)) continue;
    vistos.add(d.telefono);
    salida.push(d);
  }
  return salida;
}

const bisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const patronesCumple = (hoy) => (hoy.slice(5) === '02-28' && !bisiesto(Number(hoy.slice(0, 4))) ? ['02-28', '02-29'] : [hoy.slice(5)]);

// ---- Cumpleaños ----
// Alumnos: el saludo llega al WhatsApp de su apoderado (con autorización). Padres, profesores,
// auxiliares, dirección y demás personal: a su propio número registrado.
export async function cumpleanios(env, hoy = hoyLima()) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE cumple_auto = 1').all();
  const md = patronesCumple(hoy);
  const marcas = md.map(() => '?').join(',');
  let total = 0;
  for (const colegio of colegios) {
    const lote = `cumple-${hoy}`;
    if (await env.DB.prepare('SELECT 1 FROM wa_cola WHERE colegio_id = ? AND lote = ? LIMIT 1').bind(colegio.id, lote).first()) continue;
    const base = origen(env);
    const filas = [];
    const encola = async (tel, apoderadoId, nombre, texto) => {
      filas.push({ telefono: tel, apoderado_id: apoderadoId, nombres: nombre, texto });
    };
    const tarjeta = async (nombre, mensaje) => {
      const { token } = await guardarPieza(env, colegio.id, 'cumple', 'Feliz cumpleaños', { nombre, mensaje, fecha: hoy });
      return enlacePieza(base, token);
    };
    const { results: alumnos } = await env.DB.prepare(
      `SELECT id, nombres FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado' AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`,
    ).bind(colegio.id, ...md).all();
    for (const a of alumnos) {
      const nombre = primerNombre(a.nombres);
      const link = await tarjeta(nombre, `Hoy es un día muy especial. Todo el colegio ${colegio.nombre} te desea un feliz cumpleaños. Que lo disfrutes mucho con tu familia y tus amigos.`);
      for (const ap of await apoderadosConPermiso(env, colegio, 'a.id = ?', [a.id])) {
        await encola(ap.telefono, ap.apoderado_id, ap.nombres, `hoy está de cumpleaños ${nombre} 🎂 Todo el equipo de ${colegio.nombre} le desea un ¡feliz cumpleaños! Le dejamos una tarjeta: ${link}`);
      }
    }
    const { results: padres } = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.telefono FROM apoderados ap WHERE ap.colegio_id = ? AND ap.telefono IS NOT NULL AND substr(ap.fecha_nacimiento, 6, 5) IN (${marcas})
         AND EXISTS (SELECT 1 FROM alumno_apoderado aa WHERE aa.apoderado_id = ap.id AND
              (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = aa.alumno_id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1)`,
    ).bind(colegio.id, ...md).all();
    const { results: usuarios } = await env.DB.prepare(
      `SELECT nombre, telefono FROM usuarios WHERE colegio_id = ? AND rol != 'padre' AND activo = 1 AND telefono IS NOT NULL AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`,
    ).bind(colegio.id, ...md).all();
    const { results: personal } = await env.DB.prepare(
      `SELECT nombre, telefono FROM personal WHERE colegio_id = ? AND activo = 1 AND telefono IS NOT NULL AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`,
    ).bind(colegio.id, ...md).all();
    for (const x of [...padres.map((p) => ({ n: p.nombres, t: p.telefono, id: p.id })), ...usuarios.map((u) => ({ n: u.nombre, t: u.telefono })), ...personal.map((u) => ({ n: u.nombre, t: u.telefono }))]) {
      const link = await tarjeta(primerNombre(x.n), `Hoy es tu día. Todo el equipo de ${colegio.nombre} te desea un feliz cumpleaños y te agradece por ser parte de nuestra comunidad.`);
      await encola(x.t, x.id ?? null, x.n, `¡feliz cumpleaños! 🎉 Todo el equipo de ${colegio.nombre} te desea un día muy especial. Te dejamos una tarjeta: ${link}`);
    }
    // Un lote por persona para no repetir si alguien aparece dos veces; el marcador evita repetir el día
    const vistos = new Set();
    let n = 0;
    for (const f of filas) {
      const clave = `${f.telefono}|${f.texto}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      n += await encolar(env, colegio, [f], f.texto, 'cumple', null, lote);
    }
    total += n;
  }
  return total;
}

// Quiénes cumplen años hoy (para el panel; solo nombres)
export async function cumpleHoy(env, colegioId, hoy = hoyLima()) {
  const md = patronesCumple(hoy);
  const marcas = md.map(() => '?').join(',');
  const [a, p, u, o] = await env.DB.batch([
    env.DB.prepare(`SELECT nombres || ' ' || apellidos AS nombre, grado || ' ' || seccion AS detalle FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado' AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`).bind(colegioId, ...md),
    env.DB.prepare(`SELECT nombres || ' ' || apellidos AS nombre, 'Apoderado' AS detalle FROM apoderados WHERE colegio_id = ? AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`).bind(colegioId, ...md),
    env.DB.prepare(`SELECT nombre, rol AS detalle FROM usuarios WHERE colegio_id = ? AND rol != 'padre' AND activo = 1 AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`).bind(colegioId, ...md),
    env.DB.prepare(`SELECT nombre, COALESCE(cargo, 'Personal') AS detalle FROM personal WHERE colegio_id = ? AND activo = 1 AND substr(fecha_nacimiento, 6, 5) IN (${marcas})`).bind(colegioId, ...md),
  ]);
  return [...a.results.map((x) => ({ ...x, tipo: 'Alumno' })), ...p.results.map((x) => ({ ...x, tipo: 'Apoderado' })),
    ...u.results.map((x) => ({ ...x, tipo: 'Personal' })), ...o.results.map((x) => ({ ...x, tipo: 'Personal' }))];
}

// ---- Comunicados por fiestas (con aprobación) ----
const ANTICIPACION = { feriado: 4, dia: 3 };

async function redactar(env, c) {
  const base = textoBase(c);
  if (c.tipo !== 'dia' || !hayIA(env)) return base;
  try {
    const t = await generarTexto(env,
      'Eres el redactor de comunicados de un colegio peruano. Escribes en español, tono cálido y respetuoso, sin inventar datos, sin fechas ni horarios, de 2 a 3 oraciones.',
      `Escribe el saludo del colegio a las familias por el ${c.nombre}. Empieza con una minúscula (se enviará después de "Hola, nombre,"). Sin saludo inicial ni firma.`, { maxTokens: 160, temperatura: 0.5 });
    const limpio = String(t).replace(/^["“\s]+|["”\s]+$/g, '').replace(/\n+/g, ' ').trim();
    return limpio.length >= 40 && limpio.length <= 500 ? limpio : base;
  } catch { return base; }
}

export async function borradoresFiestas(env, hoy = hoyLima()) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE fiestas_auto = 1').all();
  let creados = 0;
  for (const colegio of colegios) {
    const aprobadores = await personalConTelefono(env, colegio.id, ['direccion', 'secretaria']);
    for (const c of proximas(hoy, 4)) {
      if (c.fecha > new Date(Date.parse(`${hoy}T12:00:00Z`) + ANTICIPACION[c.tipo] * 864e5).toISOString().slice(0, 10)) continue;
      if (await env.DB.prepare('SELECT 1 FROM borradores WHERE colegio_id = ? AND clave = ? AND fecha = ?').bind(colegio.id, c.clave, c.fecha).first()) continue;
      const texto = await redactar(env, c);
      const { id: piezaId } = await guardarPieza(env, colegio.id, 'comunicado', c.nombre, {
        titulo: c.nombre, fecha: c.fecha, texto: `Estimadas familias, ${texto}`, firma: `Dirección · ${colegio.nombre}`,
      });
      const fila = await env.DB.prepare('INSERT INTO borradores (colegio_id, clave, fecha, titulo, texto, pieza_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
        .bind(colegio.id, c.clave, c.fecha, c.nombre, texto, piezaId).first();
      creados++;
      const lote = `borrador-${fila.id}`;
      await encolar(env, colegio, aprobadores.map((u) => ({ telefono: u.telefono, nombres: u.nombre })),
        `preparé este comunicado por *${c.nombre}* (${fmt(c.fecha)}). Dice:\n\n"${texto}"\n\nResponde *APROBAR ${fila.id}* para enviarlo a todas las familias y al personal, *RECHAZAR ${fila.id}* para descartarlo o *EDITAR ${fila.id}: nuevo texto* para cambiarlo.`,
        'borrador', null, lote);
    }
  }
  return creados;
}

// Dirección o secretaría deciden por WhatsApp o desde el panel
export async function decidirBorrador(env, colegio, id, accion, usuario, nuevoTexto = null) {
  const b = await env.DB.prepare('SELECT * FROM borradores WHERE id = ? AND colegio_id = ?').bind(id, colegio.id).first();
  if (!b) return { ok: false, texto: `No encontré el comunicado ${id}.` };
  if (b.estado !== 'pendiente') return { ok: false, texto: `El comunicado ${id} ya estaba ${b.estado}.` };
  const contexto = { colegioId: colegio.id, usuario };
  if (accion === 'editar') {
    const t = String(nuevoTexto || '').trim().slice(0, 900);
    if (t.length < 10) return { ok: false, texto: 'Escribe el nuevo texto así: *EDITAR 12: el texto del comunicado*.' };
    await env.DB.batch([
      env.DB.prepare('UPDATE borradores SET texto = ? WHERE id = ?').bind(t, id),
      env.DB.prepare("UPDATE piezas SET contenido = json_set(contenido, '$.texto', ?) WHERE id = ?").bind(`Estimadas familias, ${t}`, b.pieza_id),
      sentenciaAuditoria(env, contexto, 'editar_borrador', 'borrador', id, {}),
    ]);
    return { ok: true, texto: `✏️ Actualicé el comunicado ${id}:\n\n"${t}"\n\nResponde *APROBAR ${id}* para enviarlo o *RECHAZAR ${id}* para descartarlo.` };
  }
  if (accion === 'rechazar') {
    await env.DB.batch([
      env.DB.prepare("UPDATE borradores SET estado = 'rechazado', decidido_por = ?, decidido_en = datetime('now') WHERE id = ?").bind(usuario.id ?? null, id),
      sentenciaAuditoria(env, contexto, 'rechazar_borrador', 'borrador', id, {}),
    ]);
    return { ok: true, texto: `🗑️ Descarté el comunicado por ${b.titulo}. No se envió nada.` };
  }
  const dest = await destinatariosTodos(env, colegio);
  const pieza = await env.DB.prepare('SELECT token FROM piezas WHERE id = ?').bind(b.pieza_id).first();
  const link = pieza ? `\nMíralo aquí: ${enlacePieza(origen(env), pieza.token)}` : '';
  const n = await encolar(env, colegio, dest, `${b.texto}${link}\n— Dirección, ${colegio.nombre}`, 'comunicado', usuario.id ?? null, `fiesta-${id}`);
  await env.DB.batch([
    env.DB.prepare("UPDATE borradores SET estado = 'aprobado', decidido_por = ?, decidido_en = datetime('now'), destinatarios = ? WHERE id = ?").bind(usuario.id ?? null, n, id),
    sentenciaAuditoria(env, contexto, 'aprobar_borrador', 'borrador', id, { destinatarios: n }),
  ]);
  return { ok: true, enviarCola: true, texto: `✅ Aprobado. El comunicado por ${b.titulo} va en camino a ${n} números (familias con autorización y personal). Se envía por tandas durante el día.` };
}

// ---- Reporte diario de asistencia y exámenes (a dirección, a las 10 a. m., lunes a viernes) ----
export async function examenesDelDia(env, colegioId, fecha) {
  const { results } = await env.DB.prepare(
    `SELECT u.nombre profesor, d.tipo, d.grado, d.curso, d.titulo FROM documentos d JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.colegio_id = ? AND date(d.creado_en, '-5 hours') = ? AND d.tipo IN ('examen', 'sesion') ORDER BY d.id`,
  ).bind(colegioId, fecha).all();
  return results;
}

export async function textoReporteDiario(env, colegio, fecha) {
  const r = await resumenAsistenciaDia(env, colegio.id, fecha);
  const ex = await examenesDelDia(env, colegio.id, fecha);
  const lineas = [`📋 *Reporte de hoy (${fmt(fecha)})*`, `Asistencia: ${r.presentes} presentes, ${r.faltas} faltas, ${r.tardanzas} tardanzas.`];
  for (const s of r.secciones.slice(0, 20)) lineas.push(`• ${s.grado} ${s.seccion}${s.profesor ? ` (${primerNombre(s.profesor)})` : ''}: ${s.faltas} falta(s), ${s.tardanzas} tardanza(s)`);
  if (r.sinLista.length) lineas.push(`⚠️ Sin tomar lista: ${r.sinLista.map((s) => `${s.grado} ${s.seccion}`).join(', ')}`);
  if (ex.length) {
    lineas.push('', '📝 *Evaluaciones y sesiones de hoy*');
    for (const e of ex.slice(0, 15)) lineas.push(`• ${e.profesor}: ${e.tipo === 'examen' ? 'examen' : 'sesión'} de ${e.curso || e.titulo}${e.grado ? ` (${e.grado})` : ''}`);
  }
  return lineas.join('\n');
}

export async function reporteDiario(env, hoy = hoyLima()) {
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  if (dia < 1 || dia > 5) return 0;
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE asistencia_reporte = 1').all();
  let n = 0;
  for (const colegio of colegios) {
    const ya = await env.DB.prepare('INSERT INTO reportes_enviados (colegio_id, clave) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING clave').bind(colegio.id, `dia-${hoy}`).first();
    if (!ya) continue;
    const dirs = await personalConTelefono(env, colegio.id, ['direccion']);
    n += await encolar(env, colegio, dirs.map((u) => ({ telefono: u.telefono, nombres: u.nombre })), await textoReporteDiario(env, colegio, hoy), 'reporte', null, `reporte-dia-${hoy}`);
  }
  return n;
}

// ---- Reporte mensual (último día del mes, 5 p. m.) ----
export async function construirReporte(env, colegio, mes) {
  const m = (col) => `strftime('%Y-%m', ${col}, '-5 hours') = ?`;
  const [asis, docs, pagos, vencidos, msgs, leads, visitas, acciones, comp, reins, listas] = await env.DB.batch([
    env.DB.prepare(`SELECT a.grado, a.seccion, COUNT(DISTINCT d.fecha) dias, SUM(d.estado = 'falta') faltas, SUM(d.estado = 'tardanza') tardanzas, COUNT(*) registros
      FROM asistencia_diaria d JOIN alumnos a ON a.id = d.alumno_id WHERE d.colegio_id = ? AND substr(d.fecha, 1, 7) = ? GROUP BY a.grado, a.seccion ORDER BY a.grado, a.seccion`).bind(colegio.id, mes),
    env.DB.prepare(`SELECT u.nombre, d.tipo, COALESCE(d.curso, 'sin curso') curso, COALESCE(d.grado, '') grado, COUNT(*) n FROM documentos d JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.colegio_id = ? AND ${m('d.creado_en')} GROUP BY u.id, d.tipo, d.curso, d.grado ORDER BY u.nombre, d.tipo`).bind(colegio.id, mes),
    env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(monto_centimos), 0) t FROM pagos WHERE colegio_id = ? AND estado = 'pagado' AND substr(pagado_en, 1, 7) = ?").bind(colegio.id, mes),
    env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(monto_centimos), 0) t FROM pagos WHERE colegio_id = ? AND estado = 'pendiente' AND vencimiento < ?").bind(colegio.id, `${mes}-31`),
    env.DB.prepare(`SELECT motivo, COUNT(*) n FROM mensajes WHERE colegio_id = ? AND sentido = 'saliente' AND ${m('creado_en')} GROUP BY motivo ORDER BY n DESC`).bind(colegio.id, mes),
    env.DB.prepare(`SELECT COUNT(*) n FROM leads WHERE colegio_id = ? AND ${m('creado_en')}`).bind(colegio.id, mes),
    env.DB.prepare(`SELECT estado, COUNT(*) n FROM visitas WHERE colegio_id = ? AND ${m('creado_en')} GROUP BY estado`).bind(colegio.id, mes),
    env.DB.prepare(`SELECT accion, COUNT(*) n FROM auditoria WHERE colegio_id = ? AND ${m('creado_en')} GROUP BY accion ORDER BY n DESC LIMIT 15`).bind(colegio.id, mes),
    env.DB.prepare(`SELECT tipo, COUNT(*) n, COALESCE(SUM(total_centimos), 0) t FROM comprobantes WHERE colegio_id = ? AND estado = 'emitido' AND ${m('creado_en')} GROUP BY tipo`).bind(colegio.id, mes),
    env.DB.prepare('SELECT estado, COUNT(*) n FROM reinscripciones WHERE colegio_id = ? AND anio = ? GROUP BY estado').bind(colegio.id, Number(mes.slice(0, 4)) + 1),
    env.DB.prepare('SELECT COUNT(*) n FROM asistencia_listas WHERE colegio_id = ? AND substr(fecha, 1, 7) = ?').bind(colegio.id, mes),
  ]);
  const secciones = [];
  secciones.push({ titulo: 'Asistencia', lineas: asis.results.length
    ? [`Listas tomadas en el mes: ${listas.results[0].n}.`, ...asis.results.map((a) => {
      const pct = a.registros ? Math.round((1 - a.faltas / a.registros) * 100) : 100;
      return `${a.grado} ${a.seccion}: ${a.dias} día(s) con lista, ${a.faltas} falta(s), ${a.tardanzas} tardanza(s), ${pct}% de asistencia`;
    })]
    : ['No se tomó lista en la app este mes.'] });
  const porProf = new Map();
  for (const d of docs.results) {
    const l = porProf.get(d.nombre) || [];
    l.push(`${d.n} ${d.tipo === 'examen' ? 'examen(es)' : d.tipo === 'sesion' ? 'sesión(es)' : 'material(es)'} de ${d.curso}${d.grado ? ` (${d.grado})` : ''}`);
    porProf.set(d.nombre, l);
  }
  secciones.push({ titulo: 'Exámenes y sesiones por profesor', lineas: porProf.size ? [...porProf].map(([n, l]) => `${n}: ${l.join('; ')}`) : ['Ningún profesor creó exámenes ni sesiones este mes.'] });
  secciones.push({ titulo: 'Cobranza', lineas: [`Pagos recibidos: ${pagos.results[0].n} por ${soles(pagos.results[0].t)}.`, `Cuotas vencidas sin pagar al cierre: ${vencidos.results[0].n} por ${soles(vencidos.results[0].t)}.`,
    ...comp.results.map((c) => `${c.tipo === 'boleta' ? 'Boletas' : 'Facturas'} emitidas: ${c.n} por ${soles(c.t)}.`)] });
  secciones.push({ titulo: 'Comunicación con las familias', lineas: msgs.results.length ? msgs.results.map((x) => `${x.motivo}: ${x.n} mensaje(s)`) : ['No se enviaron mensajes este mes.'] });
  secciones.push({ titulo: 'Admisiones', lineas: [`Familias interesadas nuevas: ${leads.results[0].n}.`, ...visitas.results.map((v) => `Visitas ${v.estado}s: ${v.n}`)] });
  if (reins.results.length) secciones.push({ titulo: `Reinscripción ${Number(mes.slice(0, 4)) + 1}`, lineas: reins.results.map((r) => `${r.estado.replace('_', ' ')}: ${r.n}`) });
  secciones.push({ titulo: 'Actividad registrada en la app', lineas: acciones.results.length ? acciones.results.map((a) => `${a.accion.replace(/_/g, ' ')}: ${a.n}`) : ['Sin actividad registrada.'] });
  return secciones;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;

export async function enviarReporteMensual(env, colegio, mes) {
  const secciones = await construirReporte(env, colegio, mes);
  const { token } = await guardarPieza(env, colegio.id, 'reporte', `Reporte de ${nombreMes(mes)}`, {
    titulo: `Reporte de ${nombreMes(mes)}`, fecha: hoyLima(), secciones, firma: `Generado automáticamente por ColegIA para ${colegio.nombre}`,
  });
  const dest = await personalConTelefono(env, colegio.id, ['direccion', 'secretaria']);
  const resumen = secciones.slice(0, 3).map((s) => `*${s.titulo}*\n${s.lineas.slice(0, 3).join('\n')}`).join('\n\n');
  await encolar(env, colegio, dest.map((u) => ({ telefono: u.telefono, nombres: u.nombre })),
    `este es el reporte de ${nombreMes(mes)} 📊\n\n${resumen}\n\nReporte completo: ${enlacePieza(origen(env), token)}`, 'reporte', null, `reporte-mes-${mes}`);
  return token;
}

export async function reporteMensual(env, hoy = hoyLima()) {
  const manana = new Date(Date.parse(`${hoy}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const esUltimoDia = manana.slice(0, 7) !== hoy.slice(0, 7);
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE reporte_auto = 1').all();
  let n = 0;
  for (const colegio of colegios) {
    const mes = esUltimoDia ? hoy.slice(0, 7) : null;
    if (!mes) continue;
    const ya = await env.DB.prepare('INSERT INTO reportes_enviados (colegio_id, clave) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING clave').bind(colegio.id, `mes-${mes}`).first();
    if (!ya) continue;
    await enviarReporteMensual(env, colegio, mes);
    n++;
  }
  return n;
}

export { fechaLarga };
