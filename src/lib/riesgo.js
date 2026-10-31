// Alerta temprana y radar de temas débiles. Reglas simples y explicables: el
// tutor y la dirección ven el motivo exacto de cada alerta.
export const UMBRALES = { faltas: 4, notasBajas: 2, trabado: 3, errorExamen: 0.5 };

const esNotaBaja = (n) => n === 'C' || (/^\d+$/.test(n) && Number(n) < 11);

/**
 * Alumnos en riesgo dentro de un alcance (SQL sobre alias "a").
 * Devuelve [{ id, nombres, apellidos, grado, seccion, motivos: [] }]
 */
export async function alumnosEnRiesgo(env, colegioId, alcance = { sql: '1 = 1', params: [] }, hoy = new Date()) {
  const desdeMes = new Date(hoy.getTime() - 62 * 86400000).toISOString().slice(0, 7);
  const q = (sql, ...p) => env.DB.prepare(sql).bind(...p);
  const [faltas, notas, trabados, examenes] = (await env.DB.batch([
    q(`SELECT a.id, SUM(s.faltas) n FROM asistencia s JOIN alumnos a ON a.id = s.alumno_id
        WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND s.mes >= ? AND ${alcance.sql} GROUP BY a.id HAVING n >= ?`,
      colegioId, desdeMes, ...alcance.params, UMBRALES.faltas),
    q(`SELECT a.id, n.curso, n.nota FROM notas n JOIN alumnos a ON a.id = n.alumno_id
        WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${alcance.sql}
          AND n.bimestre = (SELECT MAX(bimestre) FROM notas x WHERE x.alumno_id = a.id)`,
      colegioId, ...alcance.params),
    q(`SELECT a.id, COUNT(*) n, GROUP_CONCAT(DISTINCT t.tema) temas FROM tutor_temas t JOIN alumnos a ON a.id = t.alumno_id
        WHERE t.colegio_id = ? AND t.trabado = 1 AND t.creado_en >= datetime('now', '-14 days') AND ${alcance.sql}
        GROUP BY a.id HAVING n >= ?`, colegioId, ...alcance.params, UMBRALES.trabado),
    q(`SELECT a.id, r.falladas, r.porcentaje, r.sin_detalle, d.contenido, d.titulo FROM examen_resultados r JOIN alumnos a ON a.id = r.alumno_id
        JOIN documentos d ON d.id = r.documento_id
        WHERE a.colegio_id = ? AND r.creado_en >= datetime('now', '-30 days') AND ${alcance.sql}`, colegioId, ...alcance.params),
  ])).map((r) => r.results);

  const motivos = new Map();
  const agregar = (id, m) => { if (!motivos.has(id)) motivos.set(id, []); motivos.get(id).push(m); };
  for (const f of faltas) agregar(f.id, `${f.n} faltas en los últimos 2 meses`);
  const bajas = new Map();
  for (const n of notas) if (esNotaBaja(n.nota)) bajas.set(n.id, [...(bajas.get(n.id) || []), n.curso]);
  for (const [id, cursos] of bajas) if (cursos.length >= UMBRALES.notasBajas) agregar(id, `notas bajas en ${cursos.join(', ')}`);
  for (const t of trabados) agregar(t.id, `se trabó ${t.n} veces con el tutor IA (${String(t.temas).split(',').slice(0, 3).join(', ')})`);
  for (const e of examenes) {
    const total = JSON.parse(e.contenido || '{}').preguntas?.length || 0;
    if (e.sin_detalle) { if (e.porcentaje != null && e.porcentaje < (1 - UMBRALES.errorExamen) * 100) agregar(e.id, `sacó ${Math.round(e.porcentaje)}% en "${e.titulo}"`); continue; }
    const mal = JSON.parse(e.falladas || '[]').length;
    if (total && mal / total >= UMBRALES.errorExamen) agregar(e.id, `falló ${mal} de ${total} en "${e.titulo}"`);
  }
  if (!motivos.size) return [];
  const ids = [...motivos.keys()].slice(0, 90);
  const { results } = await env.DB.prepare(
    `SELECT id, nombres, apellidos, grado, seccion FROM alumnos WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY grado, seccion, apellidos`,
  ).bind(...ids).all();
  return results.map((a) => ({ ...a, motivos: motivos.get(a.id) })).sort((x, y) => y.motivos.length - x.motivos.length);
}

// Radar de un examen: % de error por tema y alumnos que más necesitan refuerzo
export async function radarExamen(env, documento) {
  const ex = typeof documento.contenido === 'string' ? JSON.parse(documento.contenido) : documento.contenido;
  const { results } = await env.DB.prepare(
    `SELECT r.alumno_id, r.falladas, r.puntaje, r.porcentaje, r.nivel, r.sin_detalle, a.nombres, a.apellidos FROM examen_resultados r JOIN alumnos a ON a.id = r.alumno_id
      WHERE r.documento_id = ? ORDER BY r.puntaje`,
  ).bind(documento.id).all();
  const temas = {};
  ex.preguntas.forEach((q) => { temas[q.tema] ??= { tema: q.tema, preguntas: 0, errores: 0, intentos: 0 }; temas[q.tema].preguntas++; });
  for (const r of results) {
    if (r.sin_detalle) continue;
    const mal = new Set(JSON.parse(r.falladas));
    ex.preguntas.forEach((q, i) => {
      temas[q.tema].intentos++;
      if (mal.has(i + 1)) temas[q.tema].errores++;
    });
  }
  const lista = Object.values(temas).map((t) => ({ ...t, error: t.intentos ? t.errores / t.intentos : 0 })).sort((a, b) => b.error - a.error);
  return { temas: lista, alumnos: results.map((r) => ({ ...r, falladas: JSON.parse(r.falladas) })), total: ex.preguntas.length };
}
