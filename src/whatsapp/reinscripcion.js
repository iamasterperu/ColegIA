// Reinscripción y retención: se pregunta a cada familia si su hijo continúa el próximo año,
// se recuerda a quienes no responden y dirección ve en qué va la campaña.
import { hoyLima } from '../lib/http.js';
import { normalizar } from '../lib/texto.js';
import { encolar, apoderadosConPermiso } from './comun.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';

const anioSiguiente = (colegio) => colegio.anio_escolar + 1;

export async function iniciarReinscripcion(env, colegio, usuario) {
  const anio = anioSiguiente(colegio);
  const { results: alumnos } = await env.DB.prepare("SELECT id, nombres FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegio.id).all();
  let enviados = 0;
  let sinPermiso = 0;
  for (const a of alumnos) {
    await env.DB.prepare('INSERT INTO reinscripciones (alumno_id, colegio_id, anio) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(a.id, colegio.id, anio).run();
    const ya = await env.DB.prepare('SELECT aviso_en FROM reinscripciones WHERE alumno_id = ? AND anio = ?').bind(a.id, anio).first();
    if (ya?.aviso_en) continue;
    const padres = (await apoderadosConPermiso(env, colegio, 'a.id = ?', [a.id])).slice(0, 2);
    if (!padres.length) { sinPermiso++; continue; }
    enviados += await encolar(env, colegio, padres,
      `queremos saber si *${a.nombres}* continuará en ${colegio.nombre} el año ${anio}. Responda *REINSCRIBIR* si continúa o *NO CONTINUARÉ* si no. ¡Esperamos seguir acompañándolos! 💙`,
      'reinscripcion', usuario.id ?? null, `reinsc-${anio}`);
    await env.DB.prepare("UPDATE reinscripciones SET aviso_en = datetime('now') WHERE alumno_id = ? AND anio = ?").bind(a.id, anio).run();
  }
  await sentenciaAuditoria(env, { colegioId: colegio.id, usuario }, 'iniciar_reinscripcion', 'colegio', colegio.id, { anio, enviados }).run();
  return { enviados, sinPermiso };
}

export async function estadoReinscripcion(env, colegio) {
  const anio = anioSiguiente(colegio);
  const { results } = await env.DB.prepare('SELECT estado, COUNT(*) n FROM reinscripciones WHERE colegio_id = ? AND anio = ? GROUP BY estado').bind(colegio.id, anio).all();
  if (!results.length) return `Todavía no hay una campaña de reinscripción ${anio}. Escribe *reinscripción iniciar* para empezarla.`;
  const c = Object.fromEntries(results.map((r) => [r.estado, r.n]));
  const { results: pend } = await env.DB.prepare(
    `SELECT a.nombres, a.apellidos, a.grado, a.seccion FROM reinscripciones r JOIN alumnos a ON a.id = r.alumno_id
      WHERE r.colegio_id = ? AND r.anio = ? AND r.estado = 'pendiente' ORDER BY a.grado, a.apellidos LIMIT 12`,
  ).bind(colegio.id, anio).all();
  return `🔁 *Reinscripción ${anio}*\n✅ Confirmaron: ${c.confirmada || 0}\n❌ No continúan: ${c.no_continua || 0}\n⏳ Sin responder: ${c.pendiente || 0}` +
    (pend.length ? `\n\nPrimeros sin responder:\n${pend.map((p) => `• ${p.nombres} ${p.apellidos} (${p.grado} ${p.seccion})`).join('\n')}` : '');
}

// Mensaje de un apoderado: ¿es su respuesta a la campaña? Devuelve el texto de respuesta o null.
export async function responderReinscripcion(env, colegio, persona, texto, hijos) {
  const t = normalizar(texto);
  const si = /^(reinscribir|reinscribo|reinscripcion|si continua(ra)?|continuara|continuaremos|si reinscribir)\b/.test(t);
  const no = /^(no continuar\w*|no continua|no reinscribir\w*|no reinscribo|retirar\w*|retiro)\b/.test(t);
  if (!si && !no) return null;
  const anio = anioSiguiente(colegio);
  const ids = hijos.map((h) => h.id);
  if (!ids.length) return null;
  const { results } = await env.DB.prepare(
    `SELECT r.alumno_id, a.nombres FROM reinscripciones r JOIN alumnos a ON a.id = r.alumno_id
      WHERE r.anio = ? AND r.estado = 'pendiente' AND r.alumno_id IN (${ids.map(() => '?').join(',')})`,
  ).bind(anio, ...ids).all();
  if (!results.length) return si ? `Gracias. No tenemos una reinscripción pendiente para sus hijos. Si necesita algo más, escriba *MENÚ*.` : null;
  const estado = si ? 'confirmada' : 'no_continua';
  await env.DB.batch([
    ...results.map((r) => env.DB.prepare("UPDATE reinscripciones SET estado = ?, respondido_en = datetime('now') WHERE alumno_id = ? AND anio = ?").bind(estado, r.alumno_id, anio)),
    sentenciaAuditoria(env, { colegioId: colegio.id, usuario: persona.usuario }, si ? 'confirmar_reinscripcion' : 'no_continua_reinscripcion', 'apoderado', persona.apoderado.id, { alumnos: results.length }),
  ]);
  const nombres = results.map((r) => r.nombres).join(' y ');
  return si
    ? `✅ ¡Gracias! Registramos la reinscripción ${anio} de ${nombres}. Secretaría le escribirá con los siguientes pasos. 💙`
    : `Gracias por avisarnos. Registramos que ${nombres} no continuará el ${anio}. Si fue por algún motivo que podamos ayudar a resolver, responda *HABLAR* y secretaría se comunicará con usted.`;
}

// Cron: un recordatorio a los 5 días y otro 7 días después, máximo dos
export async function seguimientoReinscripcion(env) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios').all();
  let n = 0;
  for (const colegio of colegios) {
    const anio = anioSiguiente(colegio);
    const { results: pend } = await env.DB.prepare(
      `SELECT r.alumno_id, a.nombres FROM reinscripciones r JOIN alumnos a ON a.id = r.alumno_id
        WHERE r.colegio_id = ? AND r.anio = ? AND r.estado = 'pendiente' AND r.aviso_en IS NOT NULL AND (
          (r.recordatorios = 0 AND r.aviso_en <= datetime('now', '-5 days')) OR (r.recordatorios = 1 AND r.recordado_en <= datetime('now', '-7 days'))) LIMIT 60`,
    ).bind(colegio.id, anio).all();
    for (const a of pend) {
      const padres = (await apoderadosConPermiso(env, colegio, 'a.id = ?', [a.alumno_id])).slice(0, 2);
      n += await encolar(env, colegio, padres, `le recordamos que aún no sabemos si *${a.nombres}* continuará en ${colegio.nombre} el año ${anio}. Responda *REINSCRIBIR* o *NO CONTINUARÉ*. ¡Gracias!`, 'reinscripcion', null, `reinsc-recuerdo-${hoyLima()}`);
      await env.DB.prepare("UPDATE reinscripciones SET recordatorios = recordatorios + 1, recordado_en = datetime('now') WHERE alumno_id = ? AND anio = ?").bind(a.alumno_id, anio).run();
    }
  }
  return n;
}
