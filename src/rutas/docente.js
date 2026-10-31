// Web del personal: documentos del asistente docente, radar, alertas tempranas y tutor IA.
import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { alcanceAlumnos } from '../lib/permisos.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { alumnosEnRiesgo, radarExamen } from '../lib/riesgo.js';
import { generarExamen, generarSesion } from '../ia/docente.js';
import { guardarDocumento, PARTES, enlace } from '../ia/documentos.js';
import { hayIA, SinIA, leerImagen } from '../ia/modelo.js';
import { leerWeb, leerPdf } from '../ia/fuentes.js';
import { leerExamenCalificado, interpretarLectura, nivelDe } from '../lib/calificar.js';
import { buscarAlumnos } from '../whatsapp/comun.js';
import { cursoOficial, bimestreActual } from '../whatsapp/roles/registro.js';
import { tiene } from '../lib/permisos.js';

const puedeCrear = (u) => ['direccion', 'profesor'].includes(u.rol);
async function archivoSubido(ctx, maxBytes) {
  const largo = Number(ctx.request.headers.get('content-length') || 0);
  if (largo > maxBytes) throw falla(413, 'El archivo es muy pesado. Prueba con una foto más liviana.');
  const datos = await ctx.request.arrayBuffer();
  if (!datos.byteLength) throw falla(400, 'No llegó ningún archivo');
  if (datos.byteLength > maxBytes) throw falla(413, 'El archivo es muy pesado. Prueba con una foto más liviana.');
  return { datos, mime: (ctx.request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}

const puedeDocentes = (u) => ['direccion', 'profesor', 'secretaria'].includes(u.rol);

export function rutasDocente(r) {
  r.get('/api/documentos', async (ctx, env) => {
    exigir(ctx);
    if (!puedeDocentes(ctx.usuario)) throw falla(403, 'Tu rol no tiene acceso');
    const propios = ctx.usuario.rol === 'profesor';
    const { results } = await env.DB.prepare(
      `SELECT d.id, d.tipo, d.titulo, d.grado, d.curso, d.token, d.creado_en, u.nombre AS autor,
              (SELECT COUNT(*) FROM examen_resultados r WHERE r.documento_id = d.id) AS calificados
         FROM documentos d JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.colegio_id = ? ${propios ? 'AND d.usuario_id = ?' : ''} ORDER BY d.id DESC LIMIT 100`,
    ).bind(ctx.colegioId, ...(propios ? [ctx.usuario.id] : [])).all();
    return json(results.map((d) => ({ ...d, pdfs: PARTES[d.tipo].map(([p, n]) => ({ nombre: n, url: enlace(ctx.url.origin, d.token, p) })) })));
  });

  r.get('/api/documentos/:id', async (ctx, env) => {
    exigir(ctx);
    if (!puedeDocentes(ctx.usuario)) throw falla(403, 'Tu rol no tiene acceso');
    const d = await env.DB.prepare('SELECT * FROM documentos WHERE id = ? AND colegio_id = ?').bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!d || (ctx.usuario.rol === 'profesor' && d.usuario_id !== ctx.usuario.id)) throw falla(404, 'Documento no encontrado');
    const contenido = JSON.parse(d.contenido);
    const radar = d.tipo === 'examen' ? await radarExamen(env, { ...d, contenido }) : null;
    if (radar?.alumnos.length) ctx.waitUntil(auditar(env, ctx, 'ver_resultados_examen', 'documento', d.id));
    return json({ ...d, contenido, radar, pdfs: PARTES[d.tipo].map(([p, n]) => ({ nombre: n, url: enlace(ctx.url.origin, d.token, p) })) });
  });


  // Material de origen para el examen o la sesión: foto de un libro o sílabo, PDF o página web.
  // Se convierte en texto; el archivo original nunca se guarda.
  r.post('/api/documentos/fuente', async (ctx, env) => {
    exigir(ctx);
    if (!puedeCrear(ctx.usuario)) throw falla(403, 'Solo profesores y dirección');
    if (!hayIA(env)) throw falla(503, 'La IA no está activada en este momento');
    const tipo = (ctx.request.headers.get('content-type') || '').toLowerCase();
    let texto; let origen;
    try {
      if (tipo.startsWith('application/json')) {
        const d = await cuerpo(ctx.request, 3000);
        const url = String(d.url || '').trim();
        if (!/^https:\/\//i.test(url)) throw falla(400, 'Escribe una dirección que empiece con https://');
        texto = await leerWeb(url); origen = 'web';
      } else if (tipo.startsWith('image/')) {
        const f = await archivoSubido(ctx, 6_000_000);
        texto = await leerImagen(env, f, 'Transcribe el contenido educativo de esta imagen (página de libro, sílabo, ficha o pizarra) de forma ordenada. Solo el texto.', { maxTokens: 1500 });
        if (String(texto).trim().length < 40) throw new Error('No pude leer texto en la foto. Intenta con una foto de frente, nítida y con buena luz.');
        origen = 'foto';
      } else if (tipo.startsWith('application/pdf')) {
        const f = await archivoSubido(ctx, 5_000_000);
        texto = await leerPdf(env, { datos: f.datos, mime: f.mime, nombre: 'material.pdf' }); origen = 'pdf';
      } else throw falla(415, 'Sube una foto (JPG o PNG), un PDF o escribe un enlace.');
    } catch (e) {
      if (e.estado) throw e;
      throw falla(422, e.message);
    }
    ctx.waitUntil(auditar(env, ctx, 'leer_fuente_examen', null, null, { origen }));
    return json({ texto: String(texto).slice(0, 6000), origen });
  });

  // Alumnos del alcance del usuario (para elegir a quién pertenece cada examen calificado)
  r.get('/api/documentos/:id/aula', async (ctx, env) => {
    exigir(ctx);
    if (!puedeCrear(ctx.usuario)) throw falla(403, 'Solo profesores y dirección');
    const al = alcanceAlumnos(ctx.usuario);
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.nombres, a.apellidos, a.grado, a.seccion FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${al.sql}
        ORDER BY a.grado, a.seccion, a.apellidos LIMIT 400`,
    ).bind(ctx.colegioId, ...al.params).all();
    return json(results);
  });

  // Lee la foto de UN examen ya revisado. No guarda nada: devuelve lo leído para que el profesor lo confirme.
  r.post('/api/documentos/:id/calificar-foto', async (ctx, env) => {
    exigir(ctx);
    if (!puedeCrear(ctx.usuario)) throw falla(403, 'Solo profesores y dirección');
    if (!hayIA(env)) throw falla(503, 'La IA no está activada en este momento');
    const d = await env.DB.prepare("SELECT id, contenido FROM documentos WHERE id = ? AND colegio_id = ? AND tipo = 'examen'").bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!d) throw falla(404, 'Examen no encontrado');
    if (!(ctx.request.headers.get('content-type') || '').startsWith('image/')) throw falla(415, 'Sube una foto (JPG o PNG)');
    const img = await archivoSubido(ctx, 6_000_000);
    const total = JSON.parse(d.contenido).preguntas?.length || 0;
    let lectura;
    try { lectura = await leerExamenCalificado(env, img, total); } catch { throw falla(422, 'No pude leer esta foto. Toma la foto de frente, con buena luz y que se vea la nota.'); }
    const calculo = interpretarLectura(lectura, total);
    let candidatos = [];
    if (lectura.alumno) candidatos = (await buscarAlumnos(env, { id: ctx.colegioId }, { usuario: ctx.usuario }, lectura.alumno, 5)).map((a) => a.id);
    ctx.waitUntil(auditar(env, ctx, 'calificar_examen_foto', 'documento', d.id));
    return json({ alumno_leido: lectura.alumno || '', alumno_id: candidatos.length === 1 ? candidatos[0] : null, candidatos, ...(calculo || {}), leido: !!calculo });
  });

  // Guarda los resultados que el profesor revisó (nota, porcentaje y nivel de cada alumno)
  r.post('/api/documentos/:id/resultados', async (ctx, env) => {
    exigir(ctx);
    if (!puedeCrear(ctx.usuario) || !tiene(ctx.usuario, 'ficha.academico')) throw falla(403, 'Solo profesores y dirección');
    const d = await env.DB.prepare("SELECT id, curso, contenido FROM documentos WHERE id = ? AND colegio_id = ? AND tipo = 'examen'").bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!d) throw falla(404, 'Examen no encontrado');
    const datos = await cuerpo(ctx.request, 60_000);
    const total = JSON.parse(d.contenido).preguntas?.length || 0;
    const filas = (Array.isArray(datos.filas) ? datos.filas : []).slice(0, 80);
    if (!filas.length) throw falla(400, 'No hay resultados para guardar');
    const al = alcanceAlumnos(ctx.usuario);
    const ids = [...new Set(filas.map((f) => entero(f.alumno_id)))].filter(Boolean);
    const { results: validos } = await env.DB.prepare(
      `SELECT a.id FROM alumnos a WHERE a.colegio_id = ? AND a.id IN (${ids.map(() => '?').join(',') || 'NULL'}) AND ${al.sql}`,
    ).bind(ctx.colegioId, ...ids, ...al.params).all();
    const permitidos = new Set(validos.map((v) => v.id));
    const sentencias = [];
    const guardados = [];
    const bimestre = bimestreActual();
    const curso = datos.guardar_nota ? await cursoOficial(env, { id: ctx.colegioId }, d.curso || 'General') : null;
    for (const f of filas) {
      const id = entero(f.alumno_id);
      const pct = Number(f.porcentaje);
      if (!permitidos.has(id) || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
      const falladas = Array.isArray(f.falladas) ? [...new Set(f.falladas.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= total))] : null;
      const porcentaje = Math.round(pct * 10) / 10;
      const puntaje = Math.round((porcentaje / 100) * 200) / 10;
      sentencias.push(env.DB.prepare(
        `INSERT INTO examen_resultados (documento_id, alumno_id, falladas, puntaje, registrado_por, porcentaje, nivel, sin_detalle, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'foto')
         ON CONFLICT(documento_id, alumno_id) DO UPDATE SET falladas = excluded.falladas, puntaje = excluded.puntaje, registrado_por = excluded.registrado_por,
           porcentaje = excluded.porcentaje, nivel = excluded.nivel, sin_detalle = excluded.sin_detalle, origen = excluded.origen`,
      ).bind(d.id, id, JSON.stringify(falladas || []), puntaje, ctx.usuario.id, porcentaje, nivelDe(porcentaje), falladas ? 0 : 1));
      if (curso) {
        sentencias.push(env.DB.prepare(
          `INSERT INTO notas (colegio_id, alumno_id, curso, bimestre, nota) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(alumno_id, curso, bimestre) DO UPDATE SET nota = excluded.nota`,
        ).bind(ctx.colegioId, id, curso, bimestre, String(Math.round(puntaje))));
      }
      guardados.push(id);
    }
    if (!guardados.length) throw falla(400, 'No se pudo guardar: revisa que cada examen tenga un alumno elegido');
    sentencias.push(sentenciaAuditoria(env, ctx, 'registrar_resultados_examen', 'documento', d.id, { alumnos: guardados.length }));
    await env.DB.batch(sentencias);
    return json({ guardados: guardados.length, nota_bimestre: curso ? { curso, bimestre } : null });
  });

  // Crear desde la web (lo mismo que por WhatsApp)
  r.post('/api/documentos', async (ctx, env) => {
    exigir(ctx);
    if (!['direccion', 'profesor'].includes(ctx.usuario.rol)) throw falla(403, 'Solo profesores y dirección');
    const d = await cuerpo(ctx.request, 14_000);
    const pedido = String(d.pedido || '').trim().slice(0, 500);
    if (pedido.length < 8) throw falla(400, 'Describe qué necesitas');
    const fuente = String(d.fuente || '').slice(0, 6000);
    const origenFuente = fuente ? (['foto', 'pdf', 'web'].includes(d.origen_fuente) ? d.origen_fuente : 'foto') : 'tema';
    if (!hayIA(env)) throw falla(503, 'La IA no está activada en este momento');
    try {
      if (d.tipo === 'sesion') {
        const s = await generarSesion(env, fuente ? `${pedido}\nContenido de referencia: ${fuente.slice(0, 2500)}` : pedido);
        return json(await guardarDocumento(env, ctx.colegioId, ctx.usuario.id, { tipo: 'sesion', titulo: s.titulo || pedido, grado: s.grado, curso: s.curso, pedido, contenido: s, fuente: origenFuente }), 201);
      }
      const ex = await generarExamen(env, { pedido, fuente });
      return json(await guardarDocumento(env, ctx.colegioId, ctx.usuario.id, { tipo: 'examen', titulo: ex.titulo, grado: ex.grado, curso: ex.curso, pedido, contenido: ex, fuente: origenFuente }), 201);
    } catch (e) {
      if (e instanceof SinIA) throw falla(503, e.message);
      throw falla(502, `La IA no pudo completarlo: ${e.message}`);
    }
  });

  r.get('/api/alertas', async (ctx, env) => {
    exigir(ctx);
    if (!['direccion', 'profesor', 'secretaria'].includes(ctx.usuario.rol)) throw falla(403, 'Tu rol no tiene acceso');
    const alcance = ctx.usuario.rol === 'profesor' ? alcanceAlumnos(ctx.usuario) : { sql: '1 = 1', params: [] };
    const riesgo = await alumnosEnRiesgo(env, ctx.colegioId, alcance);
    const { results: tutor } = await env.DB.prepare(
      `SELECT t.tema, t.curso, a.grado, a.seccion, COUNT(*) n, SUM(t.trabado) trabados, COUNT(DISTINCT t.alumno_id) alumnos
         FROM tutor_temas t JOIN alumnos a ON a.id = t.alumno_id
        WHERE t.colegio_id = ? AND t.creado_en >= datetime('now', '-30 days') AND ${alcance.sql}
        GROUP BY t.tema, a.grado, a.seccion ORDER BY trabados DESC, n DESC LIMIT 30`,
    ).bind(ctx.colegioId, ...alcance.params).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_alertas_tempranas', null, null, { alumnos: riesgo.length }));
    return json({ riesgo, tutor });
  });
}
