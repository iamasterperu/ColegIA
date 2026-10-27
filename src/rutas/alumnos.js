import { json, cuerpo, falla, entero, hoyLima } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { tiene, alcanceAlumnos } from '../lib/permisos.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { normalizar, nombreBusqueda, escaparLike, normalizarTelefono } from '../lib/texto.js';
import { consentidoAlumno } from '../lib/consentimiento.js';

const NIVELES = ['Inicial', 'Primaria', 'Secundaria'];
const CAMPOS_SALUD = ['alergias', 'condicion_medica', 'seguro', 'contacto_emergencia'];

// Trae un alumno solo si está dentro del alcance del rol; si no, 404 (no revela que existe).
export async function alumnoVisible(env, ctx, id) {
  const alcance = alcanceAlumnos(ctx.usuario);
  const a = await env.DB.prepare(
    `SELECT a.* FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? AND ${alcance.sql}`,
  ).bind(entero(id), ctx.colegioId, ...alcance.params).first();
  if (!a) throw falla(404, 'Alumno no encontrado');
  return a;
}

export function rutasAlumnos(r) {
  r.get('/api/alumnos', async (ctx, env) => {
    exigir(ctx, 'alumnos.buscar');
    const q = normalizar(ctx.url.searchParams.get('q') || '');
    const grado = ctx.url.searchParams.get('grado');
    const alcance = alcanceAlumnos(ctx.usuario);
    const palabras = q.split(' ').filter(Boolean).slice(0, 4);
    if (!palabras.length && !grado && ctx.usuario.rol !== 'padre' && ctx.usuario.rol !== 'profesor') {
      return json({ alumnos: [] });
    }
    const cond = ['a.colegio_id = ?', "a.estado != 'anonimizado'", alcance.sql];
    const params = [ctx.colegioId, ...alcance.params];
    for (const p of palabras) {
      cond.push("a.nombre_busqueda LIKE ? ESCAPE '\\'");
      params.push(`%${escaparLike(p)}%`);
    }
    if (grado) { cond.push('a.grado = ?'); params.push(grado); }
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.codigo, a.nombres, a.apellidos, a.grado, a.seccion, a.estado
         FROM alumnos a WHERE ${cond.join(' AND ')} ORDER BY ${palabras.length ? '' : 'a.grado, a.seccion, '}a.nombre_busqueda LIMIT ?`,
    ).bind(...params, palabras.length ? 25 : 80).all();
    if (palabras.length) ctx.waitUntil(auditar(env, ctx, 'buscar_alumnos', null, null, { q, resultados: results.length }));
    return json({ alumnos: results });
  });

  r.get('/api/alumnos/:id/ficha', async (ctx, env) => {
    exigir(ctx, 'ficha.personal');
    const u = ctx.usuario;
    const a = await alumnoVisible(env, ctx, ctx.params.id);
    const ficha = { id: a.id, secciones: [] };
    const ver = (s) => tiene(u, s) && ficha.secciones.push(s);

    if (ver('ficha.personal')) {
      ficha.personal = {
        codigo: a.codigo, nombres: a.nombres, apellidos: a.apellidos, nivel: a.nivel, grado: a.grado,
        seccion: a.seccion, estado: a.estado, observaciones: a.observaciones,
      };
      // Minimización: el docente no necesita DNI ni fecha de nacimiento.
      if (u.rol !== 'profesor') Object.assign(ficha.personal, { dni: a.dni, fecha_nacimiento: a.fecha_nacimiento });
    }

    const consultas = [];
    const apoderadosQ = env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.apellidos, ap.dni, ap.telefono, ap.email, aa.parentesco, aa.responsable_pago
         FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE aa.alumno_id = ? ORDER BY aa.responsable_pago DESC, ap.id`,
    ).bind(a.id);
    consultas.push(apoderadosQ);
    consultas.push(env.DB.prepare(
      `SELECT apoderado_id, finalidad, otorgado, medio, creado_en, version_texto FROM consentimiento_vigente WHERE alumno_id = ?`,
    ).bind(a.id));
    const [apoderados, consents] = (await env.DB.batch(consultas)).map((x) => x.results);

    if (ver('ficha.apoderados')) {
      // Un padre ve completos solo sus propios datos; del otro apoderado, nombre y parentesco.
      const ajeno = (p) => u.rol === 'padre' && p.id !== u.apoderado_id;
      ficha.apoderados = apoderados.map((p) => ({
        ...p,
        ...(ajeno(p) ? { dni: null, telefono: null, email: null } : {}),
        consentimientos: Object.fromEntries(
          consents.filter((c) => c.apoderado_id === p.id).map((c) => [c.finalidad, !!c.otorgado]),
        ),
      }));
    }
    if (ver('ficha.consentimientos')) {
      ficha.consentimientos = consents.map((c) => {
        const p = apoderados.find((x) => x.id === c.apoderado_id);
        return { ...c, apoderado: p ? `${p.nombres} ${p.apellidos}` : '' };
      });
    }

    const lotes = [];
    const claves = [];
    if (ver('ficha.academico')) {
      claves.push('notas', 'asistencia', 'examenes', 'tutor');
      lotes.push(
        env.DB.prepare('SELECT curso, bimestre, nota FROM notas WHERE alumno_id = ? ORDER BY curso, bimestre').bind(a.id),
        env.DB.prepare('SELECT mes, dias_habiles, faltas, tardanzas FROM asistencia WHERE alumno_id = ? ORDER BY mes').bind(a.id),
        env.DB.prepare(
          `SELECT d.id, d.titulo, d.contenido, r.falladas, r.puntaje, r.creado_en FROM examen_resultados r JOIN documentos d ON d.id = r.documento_id
            WHERE r.alumno_id = ? AND d.colegio_id = ? ORDER BY r.creado_en DESC LIMIT 8`,
        ).bind(a.id, ctx.colegioId),
        // Lo que practicó con el tutor IA en los últimos 60 días (solo temas, nunca la conversación)
        env.DB.prepare(
          `SELECT tema, curso, COUNT(*) AS veces, MAX(trabado) AS trabado, MAX(creado_en) AS ultimo FROM tutor_temas
            WHERE alumno_id = ? AND creado_en > datetime('now', '-60 days') GROUP BY tema ORDER BY ultimo DESC LIMIT 10`,
        ).bind(a.id),
      );
    }
    const verPagos = ver('ficha.pagos');
    const verEstadoPagos = !verPagos && ver('ficha.pagos_estado');
    if (verPagos || verEstadoPagos) {
      claves.push('pagos');
      lotes.push(env.DB.prepare(
        `SELECT id, concepto, periodo, monto_centimos, vencimiento, estado, pagado_en, medio
           FROM pagos WHERE alumno_id = ? AND estado != 'anulado' ORDER BY vencimiento`,
      ).bind(a.id));
    }
    if (ver('ficha.mensajes')) {
      const tels = apoderados.map((p) => p.telefono).filter(Boolean);
      if (tels.length) {
        claves.push('mensajes');
        lotes.push(env.DB.prepare(
          `SELECT id, telefono, sentido, tipo, texto, transcripcion, motivo, estado, canal, creado_en FROM mensajes
            WHERE colegio_id = ? AND telefono IN (${tels.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 15`,
        ).bind(ctx.colegioId, ...tels));
      }
    }
    if (ver('ficha.accesos')) {
      claves.push('accesos');
      lotes.push(env.DB.prepare(
        `SELECT usuario_nombre, rol, accion, detalle, creado_en FROM auditoria
          WHERE colegio_id = ? AND entidad = 'alumno' AND entidad_id = ? ORDER BY id DESC LIMIT 25`,
      ).bind(ctx.colegioId, a.id));
    }
    if (tiene(u, 'utiles.ver')) {
      claves.push('utiles');
      lotes.push(env.DB.prepare(
        `SELECT l.id, l.titulo, l.publicada, (SELECT COUNT(*) FROM utiles_items i WHERE i.lista_id = l.id) AS items
           FROM listas_utiles l WHERE l.colegio_id = ? AND l.grado = ? ORDER BY l.anio DESC LIMIT 1`,
      ).bind(ctx.colegioId, a.grado));
      claves.push('entregados');
      lotes.push(env.DB.prepare('SELECT COUNT(*) AS n FROM utiles_entregas WHERE alumno_id = ?').bind(a.id));
    }
    const res = lotes.length ? await env.DB.batch(lotes) : [];
    const datos = Object.fromEntries(claves.map((k, i) => [k, res[i].results]));

    if (datos.notas) {
      const examenes = datos.examenes.map((e) => {
        const ex = JSON.parse(e.contenido);
        const mal = JSON.parse(e.falladas);
        return {
          id: e.id, titulo: e.titulo, puntaje: e.puntaje, fecha: e.creado_en, total: ex.preguntas?.length || 0, falladas: mal.length,
          temas: [...new Set(mal.map((k) => ex.preguntas?.[k - 1]?.tema).filter(Boolean))].slice(0, 4),
        };
      });
      ficha.academico = { notas: datos.notas, asistencia: datos.asistencia, examenes, tutor: datos.tutor };
    }
    if (datos.pagos) {
      const hoy = hoyLima();
      const pend = datos.pagos.filter((p) => p.estado === 'pendiente');
      const vencidas = pend.filter((p) => p.vencimiento < hoy);
      if (verPagos) {
        ficha.pagos = {
          cuotas: datos.pagos,
          pagado: datos.pagos.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.monto_centimos, 0),
          pendiente: pend.reduce((s, p) => s + p.monto_centimos, 0),
          vencido: vencidas.reduce((s, p) => s + p.monto_centimos, 0),
        };
      } else {
        ficha.pagos_estado = { al_dia: vencidas.length === 0, cuotas_vencidas: vencidas.length };
      }
    }
    if (datos.mensajes) ficha.mensajes = datos.mensajes;
    if (datos.accesos) ficha.accesos = datos.accesos;
    if (datos.utiles) ficha.utiles = datos.utiles[0] && (u.rol !== 'padre' || datos.utiles[0].publicada) ? datos.utiles[0] : null;
    if (ficha.utiles) ficha.utiles.entregados = datos.entregados[0].n;

    const verSalud = tiene(u, 'ficha.salud');
    if (verSalud || tiene(u, 'ficha.salud_alertas')) {
      ficha.secciones.push(verSalud ? 'ficha.salud' : 'ficha.salud_alertas');
      if (await consentidoAlumno(env, a.id, 'salud')) {
        ficha.salud = verSalud
          ? Object.fromEntries(CAMPOS_SALUD.map((k) => [k, a[k]]))
          : { alergias: a.alergias, condicion_medica: a.condicion_medica, solo_alertas: true };
      } else {
        ficha.salud = { sin_consentimiento: true };
      }
    }

    await auditar(env, ctx, 'ver_ficha', 'alumno', a.id, { secciones: ficha.secciones.map((s) => s.replace('ficha.', '')) });
    return json(ficha);
  });

  r.post('/api/alumnos', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const d = await cuerpo(ctx.request, 20_000);
    const a = validarAlumno(d);
    const fila = await env.DB.prepare(
      `INSERT INTO alumnos (colegio_id, codigo, nombres, apellidos, nombre_busqueda, dni, fecha_nacimiento, nivel, grado, seccion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(ctx.colegioId, a.codigo, a.nombres, a.apellidos, nombreBusqueda(a.apellidos, a.nombres), a.dni,
      a.fecha_nacimiento, a.nivel, a.grado, a.seccion).first().catch((e) => {
      if (String(e).includes('UNIQUE')) throw falla(409, 'Ya existe un alumno con ese código');
      throw e;
    });
    await auditar(env, ctx, 'crear_alumno', 'alumno', fila.id);
    return json({ id: fila.id }, 201);
  });

  r.put('/api/alumnos/:id', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const a = await alumnoVisible(env, ctx, ctx.params.id);
    const d = await cuerpo(ctx.request, 20_000);
    const base = validarAlumno({ ...a, ...d });
    const cambios = Object.keys(d).filter((k) => d[k] !== a[k]);
    const tocaSalud = CAMPOS_SALUD.some((k) => k in d && (d[k] || null) !== (a[k] || null));
    if (tocaSalud) {
      if (!tiene(ctx.usuario, 'ficha.salud')) throw falla(403, 'Tu rol no puede editar datos de salud');
      if (!(await consentidoAlumno(env, a.id, 'salud'))) {
        throw falla(409, 'Para registrar datos de salud, un apoderado debe autorizarlo primero (Ley 29733, datos sensibles).');
      }
    }
    const salud = Object.fromEntries(CAMPOS_SALUD.map((k) => [k, k in d ? (String(d[k] || '').slice(0, 500) || null) : a[k]]));
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE alumnos SET codigo = ?, nombres = ?, apellidos = ?, nombre_busqueda = ?, dni = ?, fecha_nacimiento = ?,
           nivel = ?, grado = ?, seccion = ?, estado = ?, observaciones = ?, alergias = ?, condicion_medica = ?,
           seguro = ?, contacto_emergencia = ?, actualizado_en = datetime('now')
         WHERE id = ? AND colegio_id = ?`,
      ).bind(base.codigo, base.nombres, base.apellidos, nombreBusqueda(base.apellidos, base.nombres), base.dni,
        base.fecha_nacimiento, base.nivel, base.grado, base.seccion,
        d.estado === 'retirado' ? 'retirado' : d.estado === 'matriculado' ? 'matriculado' : a.estado,
        'observaciones' in d ? String(d.observaciones || '').slice(0, 1000) || null : a.observaciones,
        salud.alergias, salud.condicion_medica, salud.seguro, salud.contacto_emergencia, a.id, ctx.colegioId),
      sentenciaAuditoria(env, ctx, 'editar_alumno', 'alumno', a.id, { campos: cambios }),
    ]);
    return json({ ok: true });
  });

  // Derecho de cancelación: se borran los datos personales, se conservan los montos
  // contables (obligación tributaria) asociados a un alumno anónimo.
  r.post('/api/alumnos/:id/anonimizar', async (ctx, env) => {
    exigir(ctx, 'arco.gestionar');
    if (ctx.usuario.rol !== 'direccion') throw falla(403, 'Solo dirección puede anonimizar');
    const a = await alumnoVisible(env, ctx, ctx.params.id);
    const anon = `Anonimizado ${a.id}`;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE alumnos SET nombres = ?, apellidos = '', nombre_busqueda = '', dni = NULL, fecha_nacimiento = NULL,
           alergias = NULL, condicion_medica = NULL, seguro = NULL, contacto_emergencia = NULL, observaciones = NULL,
           estado = 'anonimizado', actualizado_en = datetime('now') WHERE id = ? AND colegio_id = ?`,
      ).bind(anon, a.id, ctx.colegioId),
      env.DB.prepare('DELETE FROM notas WHERE alumno_id = ?').bind(a.id),
      env.DB.prepare('DELETE FROM asistencia WHERE alumno_id = ?').bind(a.id),
      sentenciaAuditoria(env, ctx, 'anonimizar_alumno', 'alumno', a.id),
    ]);
    return json({ ok: true });
  });

  // Apoderado: editar contacto
  r.put('/api/apoderados/:id', async (ctx, env) => {
    exigir(ctx, 'alumnos.editar');
    const d = await cuerpo(ctx.request, 10_000);
    const p = await env.DB.prepare('SELECT * FROM apoderados WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!p) throw falla(404, 'Apoderado no encontrado');
    const tel = 'telefono' in d ? normalizarTelefono(d.telefono) : p.telefono;
    if ('telefono' in d && d.telefono && !tel) throw falla(400, 'Teléfono inválido');
    await env.DB.batch([
      env.DB.prepare('UPDATE apoderados SET nombres = ?, apellidos = ?, dni = ?, telefono = ?, email = ? WHERE id = ?').bind(
        String(d.nombres ?? p.nombres).trim().slice(0, 80), String(d.apellidos ?? p.apellidos).trim().slice(0, 80),
        d.dni ?? p.dni, tel, d.email ?? p.email, p.id),
      sentenciaAuditoria(env, ctx, 'editar_apoderado', 'apoderado', p.id, { campos: Object.keys(d) }),
    ]);
    return json({ ok: true });
  });

  r.get('/api/grados', async (ctx, env) => {
    exigir(ctx);
    const { results } = await env.DB.prepare(
      `SELECT grado, nivel, seccion, COUNT(*) AS alumnos FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'
        GROUP BY grado, nivel, seccion ORDER BY CASE nivel WHEN 'Inicial' THEN 1 WHEN 'Primaria' THEN 2 ELSE 3 END, grado, seccion`,
    ).bind(ctx.colegioId).all();
    return json(results);
  });
}

export function validarAlumno(d) {
  const t = (v, n) => String(v ?? '').trim().slice(0, n);
  const a = {
    codigo: t(d.codigo, 30), nombres: t(d.nombres, 80), apellidos: t(d.apellidos, 80),
    dni: t(d.dni, 12) || null, fecha_nacimiento: /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_nacimiento || '') ? d.fecha_nacimiento : null,
    nivel: t(d.nivel, 20), grado: t(d.grado, 40), seccion: t(d.seccion, 5) || 'A',
  };
  if (!a.codigo || !a.nombres || !a.apellidos || !a.grado) throw falla(400, 'Faltan código, nombres, apellidos o grado');
  if (!NIVELES.includes(a.nivel)) a.nivel = inferirNivel(a.grado);
  if (a.dni && !/^[0-9A-Za-z]{8,12}$/.test(a.dni)) throw falla(400, `DNI inválido: ${a.dni}`);
  return a;
}

export function inferirNivel(grado) {
  const g = normalizar(grado);
  if (g.includes('sec')) return 'Secundaria';
  if (g.includes('inic') || g.includes('anos') || g.includes('años')) return 'Inicial';
  return 'Primaria';
}
