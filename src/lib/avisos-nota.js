// Cuando se registra una nota, el padre la recibe solo en el chat de la app, con curso, bimestre, día y hora.
import { enviar, cargarConexion } from '../whatsapp/envio.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function diaYHora(fecha = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(fecha).map((x) => [x.type, x.value]));
  const dia = DIAS[new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()];
  return { dia, fecha: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

// notas: [{ alumno_id, curso, nota, bimestre }]. Un mensaje por alumno y apoderado; nunca rompe el guardado de la nota.
export async function avisarNotas(env, colegioId, usuarioId, notas) {
  let avisados = 0;
  try {
    if (!notas?.length) return 0;
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(colegioId).first();
    if (!colegio) return 0;
    const conexion = await cargarConexion(env, colegio);
    const { dia, fecha, hora } = diaYHora();
    for (const n of notas.slice(0, 80)) {
      const { results } = await env.DB.prepare(
        `SELECT ap.id, ap.telefono, a.nombres AS alumno FROM alumno_apoderado aa
           JOIN apoderados ap ON ap.id = aa.apoderado_id JOIN alumnos a ON a.id = aa.alumno_id
          WHERE aa.alumno_id = ? AND a.colegio_id = ? AND ap.telefono IS NOT NULL`,
      ).bind(n.alumno_id, colegioId).all();
      for (const ap of results) {
        const texto = `📝 Nueva nota de ${ap.alumno}\nCurso: ${n.curso}${n.bimestre ? ` (${n.bimestre}° bimestre)` : ''}\nNota: ${n.nota}\nRegistrada el ${dia} ${fecha} a las ${hora}.`;
        const r = await enviar(env, conexion, { telefono: ap.telefono, apoderadoId: ap.id, texto, motivo: `nota:${n.alumno_id}`, enviadoPor: usuarioId });
        if (r.estado === 'ok') avisados++;
      }
    }
  } catch (e) { /* el aviso es un extra: la nota ya quedó guardada */ }
  return avisados;
}
