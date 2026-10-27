// Alerta temprana semanal (lunes 8 a. m.): cada tutor recibe por WhatsApp sus alumnos
// en riesgo; si el colegio lo activa, el padre recibe un "empujoncito" amable.
import { alumnosEnRiesgo } from '../lib/riesgo.js';
import { alcanceAlumnos } from '../lib/permisos.js';
import { apoderadosConPermiso } from './comun.js';
import { resumenColegio } from './roles/personal.js';

export async function alertasSemanales(env) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios').all();
  for (const colegio of colegios) {
    const lote = `alerta-${new Date().toISOString().slice(0, 10)}`;
    const ya = await env.DB.prepare('SELECT 1 FROM wa_cola WHERE colegio_id = ? AND lote = ? LIMIT 1').bind(colegio.id, lote).first();
    if (ya) continue;
    const filas = [];
    const { results: tutores } = await env.DB.prepare(
      "SELECT id, nombre, rol, telefono FROM usuarios WHERE colegio_id = ? AND rol = 'profesor' AND activo = 1 AND telefono IS NOT NULL",
    ).bind(colegio.id).all();
    for (const t of tutores) {
      const lista = await alumnosEnRiesgo(env, colegio.id, alcanceAlumnos(t));
      if (!lista.length) continue;
      filas.push(env.DB.prepare('INSERT INTO wa_cola (colegio_id, telefono, nombre, texto, motivo, lote) VALUES (?, ?, ?, ?, ?, ?)').bind(
        colegio.id, t.telefono, t.nombre.split(' ')[0],
        `🚨 alerta temprana de la semana: ${lista.length} alumno(s) de tus secciones necesitan atención.\n${lista.slice(0, 8).map((a) => `• ${a.nombres} ${a.apellidos}: ${a.motivos.join('; ')}`).join('\n')}\nEscribe "alumno + nombre" para ver su resumen.`,
        'alerta', lote));
      if (colegio.alertas_padres) {
        for (const a of lista.slice(0, 20)) {
          for (const ap of await apoderadosConPermiso(env, colegio, 'a.id = ?', [a.id])) {
            filas.push(env.DB.prepare('INSERT INTO wa_cola (colegio_id, telefono, apoderado_id, nombre, texto, motivo, lote) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
              colegio.id, ap.telefono, ap.apoderado_id, ap.nombres.split(' ')[0],
              `queremos acompañar mejor a ${a.nombres}. Notamos: ${a.motivos.join('; ')}. Su tutor(a) puede conversar con usted esta semana; responda *HABLAR* si desea una cita.`,
              'alerta_padre', lote));
          }
        }
      }
    }
    if (filas.length) await env.DB.batch(filas);
  }
}

// Resumen diario (lun-vie 8 a. m.) para dirección, solo en colegios que lo activan
export async function resumenDiario(env) {
  const { results: colegios } = await env.DB.prepare('SELECT * FROM colegios WHERE resumen_diario = 1').all();
  for (const colegio of colegios) {
    const lote = `resumen-${new Date().toISOString().slice(0, 10)}`;
    const ya = await env.DB.prepare('SELECT 1 FROM wa_cola WHERE colegio_id = ? AND lote = ? LIMIT 1').bind(colegio.id, lote).first();
    if (ya) continue;
    const { results: directivos } = await env.DB.prepare(
      "SELECT nombre, telefono FROM usuarios WHERE colegio_id = ? AND rol = 'direccion' AND activo = 1 AND telefono IS NOT NULL",
    ).bind(colegio.id).all();
    if (!directivos.length) continue;
    const texto = `este es el resumen de hoy ☀️\n${await resumenColegio(env, colegio)}\n\nEscribe *MENÚ* para ver más.`;
    await env.DB.batch(directivos.map((d) => env.DB.prepare('INSERT INTO wa_cola (colegio_id, telefono, nombre, texto, motivo, lote) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(colegio.id, d.telefono, d.nombre.split(' ')[0], texto, 'resumen', lote)));
  }
}
