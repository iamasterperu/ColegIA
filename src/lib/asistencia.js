// Asistencia día por día. Cada toma de lista queda en `asistencia_diaria` y mantiene al día el
// resumen mensual (`asistencia`) sin contar dos veces el mismo día si se corrige la lista.
import { hoyLima } from './http.js';

// registros: [{ alumnoId, estado: 'presente'|'falta'|'tardanza' }]
export async function sentenciasAsistencia(env, colegioId, fecha, registros, usuarioId) {
  if (!registros.length) return [];
  const ids = registros.map((r) => r.alumnoId);
  const { results } = await env.DB.prepare(
    `SELECT alumno_id, estado FROM asistencia_diaria WHERE fecha = ? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
  ).bind(fecha, ...ids).all();
  const previo = new Map(results.map((r) => [r.alumno_id, r.estado]));
  const mes = fecha.slice(0, 7);
  const lotes = [];
  for (const r of registros) {
    const antes = previo.get(r.alumnoId);
    const dF = (r.estado === 'falta' ? 1 : 0) - (antes === 'falta' ? 1 : 0);
    const dT = (r.estado === 'tardanza' ? 1 : 0) - (antes === 'tardanza' ? 1 : 0);
    lotes.push(env.DB.prepare(
      `INSERT INTO asistencia_diaria (colegio_id, alumno_id, fecha, estado, registrado_por) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(alumno_id, fecha) DO UPDATE SET estado = excluded.estado, registrado_por = excluded.registrado_por`,
    ).bind(colegioId, r.alumnoId, fecha, r.estado, usuarioId ?? null));
    lotes.push(env.DB.prepare(
      `INSERT INTO asistencia (colegio_id, alumno_id, mes, dias_habiles, faltas, tardanzas) VALUES (?, ?, ?, 21, ?, ?)
       ON CONFLICT(alumno_id, mes) DO UPDATE SET faltas = MAX(0, faltas + ?), tardanzas = MAX(0, tardanzas + ?)`,
    ).bind(colegioId, r.alumnoId, mes, Math.max(0, dF), Math.max(0, dT), dF, dT));
  }
  return lotes;
}

// Marca que una sección ya tomó lista ese día
export const sentenciaLista = (env, colegioId, grado, seccion, fecha, usuarioId) => env.DB.prepare(
  `INSERT INTO asistencia_listas (colegio_id, grado, seccion, fecha, usuario_id) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(colegio_id, grado, seccion, fecha) DO UPDATE SET usuario_id = excluded.usuario_id`,
).bind(colegioId, grado, seccion, fecha, usuarioId ?? null);

// Resumen de un día: totales y secciones que no tomaron lista
export async function resumenAsistenciaDia(env, colegioId, fecha = hoyLima()) {
  const [tot, listas, secciones] = await env.DB.batch([
    env.DB.prepare('SELECT estado, COUNT(*) n FROM asistencia_diaria WHERE colegio_id = ? AND fecha = ? GROUP BY estado').bind(colegioId, fecha),
    env.DB.prepare(
      `SELECT l.grado, l.seccion, u.nombre profesor,
              SUM(CASE WHEN d.estado = 'falta' THEN 1 ELSE 0 END) faltas, SUM(CASE WHEN d.estado = 'tardanza' THEN 1 ELSE 0 END) tardanzas, COUNT(d.alumno_id) alumnos
         FROM asistencia_listas l LEFT JOIN usuarios u ON u.id = l.usuario_id
         LEFT JOIN alumnos a ON a.colegio_id = l.colegio_id AND a.grado = l.grado AND a.seccion = l.seccion AND a.estado = 'matriculado'
         LEFT JOIN asistencia_diaria d ON d.alumno_id = a.id AND d.fecha = l.fecha
        WHERE l.colegio_id = ? AND l.fecha = ? GROUP BY l.grado, l.seccion ORDER BY l.grado, l.seccion`,
    ).bind(colegioId, fecha),
    env.DB.prepare("SELECT DISTINCT grado, seccion FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado' ORDER BY grado, seccion").bind(colegioId),
  ]);
  const cuenta = Object.fromEntries(tot.results.map((r) => [r.estado, r.n]));
  const hechas = new Set(listas.results.map((l) => `${l.grado}|${l.seccion}`));
  return {
    fecha, presentes: cuenta.presente || 0, faltas: cuenta.falta || 0, tardanzas: cuenta.tardanza || 0,
    secciones: listas.results, sinLista: secciones.results.filter((s) => !hechas.has(`${s.grado}|${s.seccion}`)),
  };
}
