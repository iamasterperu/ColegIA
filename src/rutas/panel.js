import { json, hoyLima } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar } from '../lib/auditoria.js';

// Panel de dirección: todo en un solo batch para usar una sola ida a D1.
export function rutasPanel(r) {
  r.get('/api/panel', async (ctx, env) => {
    exigir(ctx, 'panel.ver');
    const id = ctx.colegioId;
    const hoy = hoyLima();
    const mesActual = hoy.slice(0, 7);
    const q = (sql, ...p) => env.DB.prepare(sql).bind(...p);
    const res = await env.DB.batch([
      q(`SELECT nivel, COUNT(*) AS n FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado' GROUP BY nivel`, id),
      q(`SELECT
           SUM(CASE WHEN estado = 'pagado' THEN monto_centimos ELSE 0 END) AS cobrado,
           SUM(CASE WHEN estado = 'pendiente' AND vencimiento < ? THEN monto_centimos ELSE 0 END) AS vencido,
           SUM(CASE WHEN vencimiento < ? THEN monto_centimos ELSE 0 END) AS emitido,
           SUM(CASE WHEN estado = 'pagado' AND substr(pagado_en, 1, 7) = ? THEN monto_centimos ELSE 0 END) AS cobrado_mes,
           COUNT(DISTINCT CASE WHEN estado = 'pendiente' AND vencimiento < ? THEN alumno_id END) AS alumnos_morosos
         FROM pagos WHERE colegio_id = ? AND estado != 'anulado'`, hoy, hoy, mesActual, hoy, id),
      q(`SELECT periodo,
           SUM(monto_centimos) AS emitido,
           SUM(CASE WHEN estado = 'pagado' THEN monto_centimos ELSE 0 END) AS cobrado
         FROM pagos WHERE colegio_id = ? AND estado != 'anulado' AND periodo IS NOT NULL AND periodo <= ?
         GROUP BY periodo ORDER BY periodo DESC LIMIT 8`, id, mesActual),
      q(`SELECT a.grado, a.nivel, COUNT(DISTINCT a.id) AS alumnos, SUM(p.monto_centimos) AS deuda
           FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
          WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND p.vencimiento < ?
          GROUP BY a.grado ORDER BY deuda DESC LIMIT 12`, id, hoy),
      q(`SELECT finalidad, SUM(otorgado) AS si, COUNT(*) AS total FROM consentimiento_vigente
          WHERE colegio_id = ? GROUP BY finalidad`, id),
      q(`SELECT COUNT(DISTINCT aa.apoderado_id) AS n FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id
          WHERE a.colegio_id = ? AND a.estado = 'matriculado'`, id),
      q(`SELECT COUNT(*) AS n, SUM(origen = 'automatico') AS auto FROM recordatorios
          WHERE colegio_id = ? AND creado_en >= datetime('now', '-30 days')`, id),
      q(`SELECT COUNT(DISTINCT telefono) AS n FROM mensajes WHERE colegio_id = ? AND estado = 'por_atender'`, id),
      q(`SELECT COUNT(*) AS n, MIN(creado_en) AS mas_antigua FROM solicitudes_arco WHERE colegio_id = ? AND estado = 'pendiente'`, id),
      q(`SELECT usuario_nombre, rol, accion, entidad, entidad_id, creado_en FROM auditoria
          WHERE colegio_id = ? ORDER BY id DESC LIMIT 8`, id),
      q(`SELECT rol, COUNT(*) AS n FROM auditoria WHERE colegio_id = ? AND accion = 'ver_ficha'
          AND creado_en >= datetime('now', '-7 days') GROUP BY rol`, id),
      q(`SELECT COUNT(*) AS n FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'
          AND (alergias IS NOT NULL AND alergias != '')`, id),
    ]);
    const [niveles, fin, meses, grados, consent, apoderados, recordatorios, porAtender, arco, recientes, lecturas, alergias] =
      res.map((x) => x.results);
    const total = niveles.reduce((s, n) => s + n.n, 0);
    const f = fin[0] || {};
    ctx.waitUntil(auditar(env, ctx, 'ver_panel'));
    return json({
      hoy,
      alumnos: { total, por_nivel: niveles, con_alergias: alergias[0].n },
      finanzas: {
        cobrado: f.cobrado || 0, vencido: f.vencido || 0, emitido: f.emitido || 0, cobrado_mes: f.cobrado_mes || 0,
        alumnos_morosos: f.alumnos_morosos || 0,
        morosidad: total ? (f.alumnos_morosos || 0) / total : 0,
        cobranza: f.emitido ? (f.emitido - f.vencido) / f.emitido : 0,
        por_mes: meses.reverse(),
        deuda_por_grado: grados,
      },
      cumplimiento: {
        apoderados: apoderados[0].n,
        consentimientos: consent,
        arco_pendientes: arco[0].n,
        arco_mas_antigua: arco[0].mas_antigua,
        lecturas_fichas_7d: lecturas,
      },
      whatsapp: { recordatorios_30d: recordatorios[0].n, automaticos_30d: recordatorios[0].auto || 0, por_atender: porAtender[0].n },
      actividad: recientes,
    });
  });
}
