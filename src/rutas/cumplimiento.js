// Ley 29733: consentimientos, derechos ARCO y registro de accesos.
import { json, cuerpo, falla, entero, ip } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { FINALIDADES } from '../lib/consentimiento.js';

const TIPOS_ARCO = ['acceso', 'rectificacion', 'cancelacion', 'oposicion'];

export function rutasCumplimiento(r) {
  // Padre: sus autorizaciones por hijo. Personal: estado por alumno.
  r.get('/api/consentimientos', async (ctx, env) => {
    const u = ctx.usuario;
    if (u?.rol === 'padre') {
      exigir(ctx, 'consentimientos.propios');
      const { results: hijos } = await env.DB.prepare(
        `SELECT a.id, a.nombres, a.apellidos, a.grado, a.seccion FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id
          WHERE aa.apoderado_id = ? AND a.estado = 'matriculado'`,
      ).bind(u.apoderado_id).all();
      const { results: vigentes } = await env.DB.prepare(
        'SELECT alumno_id, finalidad, otorgado, medio, creado_en, version_texto FROM consentimiento_vigente WHERE apoderado_id = ?',
      ).bind(u.apoderado_id).all();
      return json({ hijos: hijos.map((h) => ({ ...h, consentimientos: vigentes.filter((v) => v.alumno_id === h.id) })) });
    }
    exigir(ctx, 'consentimientos.ver');
    const finalidad = FINALIDADES[ctx.url.searchParams.get('finalidad')] ? ctx.url.searchParams.get('finalidad') : 'whatsapp';
    const soloPendientes = ctx.url.searchParams.get('pendientes') === '1';
    const { results } = await env.DB.prepare(
      `SELECT a.id AS alumno_id, a.nombres AS alumno_nombres, a.apellidos AS alumno_apellidos, a.grado, a.seccion,
              ap.id AS apoderado_id, ap.nombres, ap.apellidos, ap.telefono,
              cv.otorgado, cv.medio, cv.creado_en
         FROM alumnos a JOIN alumno_apoderado aa ON aa.alumno_id = a.id JOIN apoderados ap ON ap.id = aa.apoderado_id
         LEFT JOIN consentimiento_vigente cv ON cv.apoderado_id = ap.id AND cv.alumno_id = a.id AND cv.finalidad = ?
        WHERE a.colegio_id = ? AND a.estado = 'matriculado' ${soloPendientes ? 'AND cv.id IS NULL' : ''}
        ORDER BY a.grado, a.apellidos LIMIT 400`,
    ).bind(finalidad, ctx.colegioId).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_consentimientos', null, null, { finalidad }));
    return json({ finalidad, filas: results });
  });

  r.post('/api/consentimientos', async (ctx, env) => {
    const u = ctx.usuario;
    const d = await cuerpo(ctx.request, 3000);
    if (!FINALIDADES[d.finalidad]) throw falla(400, 'Finalidad inválida');
    let apoderadoId;
    let medio;
    if (u?.rol === 'padre') {
      exigir(ctx, 'consentimientos.propios');
      apoderadoId = u.apoderado_id;
      medio = 'web';
    } else {
      exigir(ctx, 'consentimientos.registrar'); // consentimiento firmado en papel
      apoderadoId = entero(d.apoderado_id);
      medio = 'presencial';
    }
    const vinculo = await env.DB.prepare(
      `SELECT 1 FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id
        WHERE aa.alumno_id = ? AND aa.apoderado_id = ? AND a.colegio_id = ?`,
    ).bind(entero(d.alumno_id), apoderadoId, ctx.colegioId).first();
    if (!vinculo) throw falla(404, 'El apoderado no está vinculado a ese alumno');
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio, registrado_por, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ctx.colegioId, apoderadoId, entero(d.alumno_id), d.finalidad, d.otorgado ? 1 : 0,
        FINALIDADES[d.finalidad].version, medio, u.id, ip(ctx.request)),
      sentenciaAuditoria(env, ctx, d.otorgado ? 'otorgar_consentimiento' : 'revocar_consentimiento', 'alumno',
        entero(d.alumno_id), { finalidad: d.finalidad, medio, apoderado_id: apoderadoId }),
    ]);
    return json({ ok: true });
  });

  // ---- Derechos ARCO ----
  r.get('/api/arco', async (ctx, env) => {
    const u = ctx.usuario;
    if (u?.rol === 'padre') {
      exigir(ctx, 'arco.solicitar');
      const { results } = await env.DB.prepare(
        'SELECT id, tipo, detalle, estado, respuesta, creado_en, atendido_en FROM solicitudes_arco WHERE apoderado_id = ? ORDER BY id DESC',
      ).bind(u.apoderado_id).all();
      return json(results);
    }
    exigir(ctx, 'arco.gestionar');
    const { results } = await env.DB.prepare(
      `SELECT s.*, ap.nombres, ap.apellidos, ap.telefono, ap.email,
              (SELECT GROUP_CONCAT(a.id || ':' || a.nombres || ' ' || a.apellidos, '|') FROM alumno_apoderado aa
                 JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = s.apoderado_id) AS hijos
         FROM solicitudes_arco s JOIN apoderados ap ON ap.id = s.apoderado_id
        WHERE s.colegio_id = ? ORDER BY s.estado = 'pendiente' DESC, s.id DESC LIMIT 100`,
    ).bind(ctx.colegioId).all();
    return json(results);
  });

  r.post('/api/arco', async (ctx, env) => {
    exigir(ctx, 'arco.solicitar');
    const d = await cuerpo(ctx.request, 5000);
    if (!TIPOS_ARCO.includes(d.tipo)) throw falla(400, 'Tipo de solicitud inválido');
    const detalle = String(d.detalle || '').trim().slice(0, 2000);
    if (detalle.length < 10) throw falla(400, 'Cuéntanos con más detalle qué necesitas');
    const fila = await env.DB.prepare(
      'INSERT INTO solicitudes_arco (colegio_id, apoderado_id, usuario_id, tipo, detalle) VALUES (?, ?, ?, ?, ?) RETURNING id',
    ).bind(ctx.colegioId, ctx.usuario.apoderado_id, ctx.usuario.id, d.tipo, detalle).first();
    await auditar(env, ctx, 'solicitud_arco', 'solicitud_arco', fila.id, { tipo: d.tipo });
    return json({ id: fila.id }, 201);
  });

  r.post('/api/arco/:id/atender', async (ctx, env) => {
    exigir(ctx, 'arco.gestionar');
    const d = await cuerpo(ctx.request, 5000);
    if (!['atendida', 'rechazada'].includes(d.estado)) throw falla(400, 'Estado inválido');
    const respuesta = String(d.respuesta || '').trim().slice(0, 2000);
    if (!respuesta) throw falla(400, 'Escribe la respuesta para el apoderado');
    const res = await env.DB.prepare(
      `UPDATE solicitudes_arco SET estado = ?, respuesta = ?, atendido_por = ?, atendido_en = datetime('now')
        WHERE id = ? AND colegio_id = ? AND estado = 'pendiente'`,
    ).bind(d.estado, respuesta, ctx.usuario.id, entero(ctx.params.id), ctx.colegioId).run();
    if (!res.meta.changes) throw falla(404, 'Solicitud no encontrada o ya atendida');
    await auditar(env, ctx, 'atender_arco', 'solicitud_arco', entero(ctx.params.id), { estado: d.estado });
    return json({ ok: true });
  });

  // Derecho de acceso: el padre descarga todo lo que el colegio guarda de él y de sus hijos.
  r.get('/api/mis-datos', async (ctx, env) => {
    exigir(ctx, 'arco.solicitar');
    const apId = ctx.usuario.apoderado_id;
    const q = (sql, ...p) => env.DB.prepare(sql).bind(...p);
    const [ap, hijos, pagos, notas, consent, mensajes, accesos] = (await env.DB.batch([
      q('SELECT nombres, apellidos, dni, telefono, email, creado_en FROM apoderados WHERE id = ?', apId),
      q(`SELECT a.id, a.codigo, a.nombres, a.apellidos, a.dni, a.fecha_nacimiento, a.nivel, a.grado, a.seccion, a.estado,
                a.alergias, a.condicion_medica, a.seguro, a.contacto_emergencia
           FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = ?`, apId),
      q(`SELECT p.alumno_id, p.concepto, p.monto_centimos, p.vencimiento, p.estado, p.pagado_en FROM pagos p
          WHERE p.alumno_id IN (SELECT alumno_id FROM alumno_apoderado WHERE apoderado_id = ?)`, apId),
      q(`SELECT n.alumno_id, n.curso, n.bimestre, n.nota FROM notas n
          WHERE n.alumno_id IN (SELECT alumno_id FROM alumno_apoderado WHERE apoderado_id = ?)`, apId),
      q('SELECT alumno_id, finalidad, otorgado, version_texto, medio, creado_en FROM consentimientos WHERE apoderado_id = ? ORDER BY id', apId),
      q('SELECT sentido, tipo, texto, transcripcion, creado_en FROM mensajes WHERE apoderado_id = ? ORDER BY id', apId),
      q(`SELECT usuario_nombre, rol, accion, entidad_id, creado_en FROM auditoria WHERE colegio_id = ? AND entidad = 'alumno'
          AND entidad_id IN (SELECT alumno_id FROM alumno_apoderado WHERE apoderado_id = ?) ORDER BY id DESC LIMIT 500`, ctx.colegioId, apId),
    ])).map((x) => x.results);
    await auditar(env, ctx, 'descargar_mis_datos', 'apoderado', apId);
    return json({ generado_en: new Date().toISOString(), apoderado: ap[0], hijos, pagos, notas, consentimientos: consent, mensajes, accesos },
      200, { 'content-disposition': 'attachment; filename="mis-datos-colegia.json"' });
  });

  // ---- Registro de accesos (quién ve qué) ----
  r.get('/api/auditoria', async (ctx, env) => {
    exigir(ctx, 'auditoria.ver');
    const p = ctx.url.searchParams;
    const cond = ['au.colegio_id = ?'];
    const params = [ctx.colegioId];
    if (p.get('accion')) { cond.push('au.accion = ?'); params.push(p.get('accion')); }
    if (p.get('rol')) { cond.push('au.rol = ?'); params.push(p.get('rol')); }
    if (p.get('usuario')) { cond.push('au.usuario_id = ?'); params.push(entero(p.get('usuario'))); }
    if (p.get('alumno')) { cond.push("au.entidad = 'alumno' AND au.entidad_id = ?"); params.push(entero(p.get('alumno'))); }
    if (p.get('antes')) { cond.push('au.id < ?'); params.push(entero(p.get('antes'))); }
    const { results } = await env.DB.prepare(
      `SELECT au.id, au.usuario_id, au.usuario_nombre, au.rol, au.accion, au.entidad, au.entidad_id, au.detalle, au.ip, au.creado_en,
              CASE WHEN au.entidad = 'alumno' THEN (SELECT nombres || ' ' || apellidos FROM alumnos WHERE id = au.entidad_id) END AS alumno
         FROM auditoria au WHERE ${cond.join(' AND ')} ORDER BY au.id DESC LIMIT 100`,
    ).bind(...params).all();
    return json(results);
  });
}
