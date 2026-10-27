// Funciones con IA y de aula para el personal: asistente docente (exámenes, sesiones,
// adaptación, traducción), resultados y radar, alertas tempranas y útiles por alumno.
import { alcanceAlumnos, tiene } from '../../lib/permisos.js';
import { normalizar } from '../../lib/texto.js';
import { alumnosEnRiesgo, radarExamen } from '../../lib/riesgo.js';
import { generarExamen, generarSesion, adaptarMaterial, traducir, cantidadPedida } from '../../ia/docente.js';
import { guardarDocumento, enlace, archivo, PARTES } from '../../ia/documentos.js';
import { hayIA, SinIA } from '../../ia/modelo.js';
import { auditoria, buscarAlumnos, apoderadosConPermiso } from '../comun.js';
import { resolverAlumno } from './personal.js';
import { notasPorTexto, asistenciaAula } from './registro.js';

const SIN_IA = '⚠️ La inteligencia artificial no está activada en este momento. Inténtalo en unos minutos.';
const pct = (x) => `${Math.round(x * 100)}%`;

async function conIA(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SinIA) return { texto: SIN_IA };
    return { texto: `No pude completarlo: ${e.message}. Prueba con un pedido más específico.` };
  }
}

// ---------- Asistente docente ----------
async function examen(env, colegio, persona, { consulta, texto, origen, avisarYa, fuente }) {
  const pedido = (consulta || texto).trim();
  if (pedido.length < 8) {
    return { texto: 'Cuéntame qué examen necesitas. Ejemplo: "examen de 20 preguntas de fracciones para 2° de primaria". También puedes enviarme una foto del libro o del sílabo.', pendiente: { accion: 'pedir', datos: { intencion: 'examen' } } };
  }
  if (!hayIA(env)) return { texto: SIN_IA };
  await avisarYa(`⏳ Preparando tu examen de ${cantidadPedida(pedido)} preguntas con versión A, versión B, solucionario y rúbrica. Tarda menos de un minuto…`);
  return conIA(async () => {
    const ex = await generarExamen(env, { pedido, fuente });
    const d = await guardarDocumento(env, colegio.id, persona.usuario.id, { tipo: 'examen', titulo: ex.titulo, grado: ex.grado, curso: ex.curso, pedido, contenido: ex });
    await auditoria(env, colegio, persona, 'crear_examen', 'documento', d.id).run();
    const doc = { titulo: ex.titulo };
    const enlaces = PARTES.examen.map(([p, n]) => `• ${n}: ${enlace(origen, d.token, p)}`).join('\n');
    return {
      texto: `✅ *${ex.titulo}* — ${ex.preguntas.length} preguntas (código ${d.id}).\n${enlaces}\n\nCuando lo califiques, envíame: *resultados ${d.id}: Mateo Quispe 2 5 9* (las preguntas que falló cada alumno) y te armo el radar de temas débiles.`,
      documento: { url: enlace(origen, d.token, 'a'), nombre: archivo(doc, 'version_A') },
    };
  });
}

async function sesion(env, colegio, persona, { consulta, texto, origen, avisarYa, fuente }) {
  const pedido = (consulta || texto).trim();
  if (pedido.length < 8) return { texto: '¿Sobre qué tema y para qué grado? Ejemplo: "sesión sobre el ciclo del agua para 4° de primaria".', pendiente: { accion: 'pedir', datos: { intencion: 'sesion' } } };
  if (!hayIA(env)) return { texto: SIN_IA };
  await avisarYa('⏳ Planificando tu sesión de aprendizaje…');
  return conIA(async () => {
    const s = await generarSesion(env, fuente ? `${pedido}\nContenido de referencia: ${fuente.slice(0, 2500)}` : pedido);
    const d = await guardarDocumento(env, colegio.id, persona.usuario.id, { tipo: 'sesion', titulo: s.titulo || pedido, grado: s.grado, curso: s.curso, pedido, contenido: s });
    await auditoria(env, colegio, persona, 'crear_sesion', 'documento', d.id).run();
    return {
      texto: `✅ *Sesión: ${s.titulo}*\n🎯 ${s.proposito || ''}\n\nInicio: ${(s.inicio || []).slice(0, 2).join(' ')}\n…\nPDF completo: ${enlace(origen, d.token, 'sesion')}`,
      documento: { url: enlace(origen, d.token, 'sesion'), nombre: archivo({ titulo: s.titulo || 'sesion' }, 'sesion') },
    };
  });
}

async function adaptar(env, colegio, persona, { consulta, texto, origen, avisarYa, fuente }) {
  const pedido = `${consulta || texto}${fuente ? `\nMaterial original:\n${fuente.slice(0, 2500)}` : ''}`;
  if (!hayIA(env)) return { texto: SIN_IA };
  await avisarYa('⏳ Adaptando el material…');
  return conIA(async () => {
    const t = await adaptarMaterial(env, pedido);
    const d = await guardarDocumento(env, colegio.id, persona.usuario.id, { tipo: 'material', titulo: 'Material adaptado', pedido, contenido: { texto: t } });
    return { texto: `${t.slice(0, 2500)}\n\nPDF: ${enlace(origen, d.token, 'texto')}` };
  });
}

export async function traducirComunicado(env, { consulta }) {
  const m = consulta.match(/^(?:al?\s+)?(ingl[eé]s|quechua|aimara|aymara|portugu[eé]s|franc[eé]s|chino|italiano|alem[aá]n|espa[nñ]ol)\b[\s:,-]*([\s\S]*)$/i);
  if (!m || !m[2].trim()) return { texto: 'Escríbelo así: "traducir al inglés: mañana no hay clases por el feriado".' };
  if (!hayIA(env)) return { texto: SIN_IA };
  return conIA(async () => ({ texto: `🌐 *${m[1]}*\n${await traducir(env, m[1], m[2].trim())}` }));
}

// ---------- Resultados, radar y tutor ----------
async function ultimoExamen(env, colegio, persona, codigo) {
  const sql = codigo
    ? 'SELECT * FROM documentos WHERE id = ? AND colegio_id = ? AND tipo = \'examen\''
    : 'SELECT * FROM documentos WHERE colegio_id = ? AND tipo = \'examen\' AND usuario_id = ? ORDER BY id DESC LIMIT 1';
  return codigo ? env.DB.prepare(sql).bind(codigo, colegio.id).first() : env.DB.prepare(sql).bind(colegio.id, persona.usuario.id).first();
}

async function resultados(env, colegio, persona, { consulta }) {
  const codigo = Number(consulta.match(/^\s*(\d+)\s*:/)?.[1]) || null;
  const doc = await ultimoExamen(env, colegio, persona, codigo);
  if (!doc) return { texto: 'Primero crea un examen (escribe "examen de …").' };
  const cuerpo = codigo ? consulta.replace(/^\s*\d+\s*:/, '') : consulta;
  const total = JSON.parse(doc.contenido).preguntas.length;
  const lineas = cuerpo.split(/[;\n]+/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return { texto: `Envíame las preguntas que falló cada alumno en "${doc.titulo}" (código ${doc.id}):\n*resultados ${doc.id}: Mateo Quispe 2 5 9; Ana Paz 1 3*\nSi un alumno no falló ninguna, escribe 0.` };
  const ok = [];
  const dudas = [];
  const lotes = [];
  for (const l of lineas) {
    const nums = [...new Set((l.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= total))];
    const nombre = l.replace(/[\d,]+/g, ' ').trim();
    const encontrados = await buscarAlumnos(env, colegio, persona, nombre, 2);
    if (encontrados.length !== 1) { dudas.push(nombre); continue; }
    const a = encontrados[0];
    lotes.push(env.DB.prepare(
      `INSERT INTO examen_resultados (documento_id, alumno_id, falladas, puntaje, registrado_por) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(documento_id, alumno_id) DO UPDATE SET falladas = excluded.falladas, puntaje = excluded.puntaje`,
    ).bind(doc.id, a.id, JSON.stringify(nums), Math.round(((total - nums.length) / total) * 200) / 10, persona.usuario.id));
    ok.push(`${a.nombres} ${a.apellidos}: ${Math.round(((total - nums.length) / total) * 200) / 10}`);
  }
  if (lotes.length) await env.DB.batch(lotes);
  return { texto: `✅ Guardé ${ok.length} resultado(s) de "${doc.titulo}":\n${ok.map((x) => `• ${x}`).join('\n')}${dudas.length ? `\n\n⚠️ No identifiqué: ${dudas.join(', ')} (escribe nombre y apellido).` : ''}\n\nEscribe *radar* para ver los temas débiles del aula.` };
}

async function radar(env, colegio, persona, { consulta }) {
  const doc = await ultimoExamen(env, colegio, persona, Number(consulta.match(/\d+/)?.[0]) || null);
  if (!doc) return { texto: 'Aún no tienes exámenes con resultados. Crea uno escribiendo "examen de …".' };
  const r = await radarExamen(env, doc);
  if (!r.alumnos.length) return { texto: `"${doc.titulo}" todavía no tiene resultados. Envíalos así: *resultados ${doc.id}: Mateo Quispe 2 5 9*` };
  const barra = (x) => '█'.repeat(Math.round(x * 10)) + '░'.repeat(10 - Math.round(x * 10));
  const refuerzo = r.alumnos.filter((a) => a.falladas.length / r.total >= 0.5);
  return { texto: `📡 *Radar de temas — ${doc.titulo}*\n(${r.alumnos.length} alumnos calificados)\n` +
    r.temas.map((t) => `${barra(t.error)} ${pct(t.error)} ${t.tema}`).join('\n') +
    `\n\n🔴 Reforzar primero: *${r.temas[0].tema}*` +
    (refuerzo.length ? `\n🙋 Necesitan ayuda: ${refuerzo.slice(0, 8).map((a) => `${a.nombres} ${a.apellidos.split(' ')[0]}`).join(', ')}` : '') };
}

async function temasTutor(env, colegio, persona) {
  const al = alcanceAlumnos(persona.usuario);
  const { results } = await env.DB.prepare(
    `SELECT t.tema, t.curso, COUNT(*) n, SUM(t.trabado) trabados, COUNT(DISTINCT t.alumno_id) alumnos FROM tutor_temas t JOIN alumnos a ON a.id = t.alumno_id
      WHERE t.colegio_id = ? AND t.creado_en >= datetime('now', '-14 days') AND ${al.sql} GROUP BY t.tema ORDER BY trabados DESC, n DESC LIMIT 10`,
  ).bind(colegio.id, ...al.params).all();
  return { texto: results.length ? '🧠 *Tutor IA — últimos 14 días*\n' + results.map((r) => `• ${r.tema}${r.curso ? ` (${r.curso})` : ''}: ${r.alumnos} alumno(s), se trabaron ${r.trabados} vez/veces`).join('\n') : 'Tus alumnos aún no usan el tutor IA en los últimos 14 días.' };
}

export async function riesgo(env, colegio, persona) {
  const al = persona.rol === 'profesor' ? alcanceAlumnos(persona.usuario) : { sql: '1 = 1', params: [] };
  const lista = await alumnosEnRiesgo(env, colegio.id, al);
  await auditoria(env, colegio, persona, 'ver_alertas_tempranas', null, null, { alumnos: lista.length }).run();
  if (!lista.length) return { texto: '✅ No hay alumnos en riesgo con las reglas actuales (faltas, notas bajas, tutor y exámenes).' };
  if (persona.rol === 'direccion') {
    const aulas = {};
    for (const a of lista) aulas[`${a.grado} ${a.seccion}`] = (aulas[`${a.grado} ${a.seccion}`] || 0) + 1;
    return { texto: `🚨 *Alerta temprana: ${lista.length} alumnos en riesgo*\n` + Object.entries(aulas).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, n]) => `• ${k}: ${n}`).join('\n') +
      `\n\nPrimeros casos:\n${lista.slice(0, 5).map((a) => `• ${a.nombres} ${a.apellidos} (${a.grado} ${a.seccion}): ${a.motivos.join('; ')}`).join('\n')}` };
  }
  return { texto: `🚨 *Alumnos en riesgo de tus secciones*\n${lista.slice(0, 12).map((a) => `• ${a.nombres} ${a.apellidos} (${a.seccion}): ${a.motivos.join('; ')}`).join('\n')}\n\nActúa antes de fin de bimestre: escribe "alumno + nombre" para ver su resumen.` };
}

// ---------- Útiles inteligentes ----------
export async function listaDeAlumno(env, colegio, alumno) {
  const lista = await env.DB.prepare('SELECT id, titulo FROM listas_utiles WHERE colegio_id = ? AND grado = ? ORDER BY anio DESC LIMIT 1').bind(colegio.id, alumno.grado).first();
  if (!lista) return null;
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.cantidad, i.descripcion, (SELECT 1 FROM utiles_entregas e WHERE e.item_id = i.id AND e.alumno_id = ?) AS entregado
       FROM utiles_items i WHERE i.lista_id = ? ORDER BY i.orden`,
  ).bind(alumno.id, lista.id).all();
  return { ...lista, items: results };
}

export async function utilesAlumno(env, colegio, persona, { consulta, alumnoId }) {
  const nombre = consulta.replace(/^(utiles|útiles|entreg\w*|lista de utiles|lista de útiles)\s*/i, '').trim();
  const r = await resolverAlumno(env, colegio, persona, nombre, 'utiles', {}, alumnoId);
  if (!r.alumno) return r.respuesta;
  const l = await listaDeAlumno(env, colegio, r.alumno);
  if (!l) return { texto: `Aún no hay lista de útiles de ${r.alumno.grado}.` };
  const faltan = l.items.filter((i) => !i.entregado).length;
  return {
    texto: `📚 *${r.alumno.nombres} ${r.alumno.apellidos}* — ${l.titulo}\n` + l.items.map((i, n) => `${i.entregado ? '✅' : '⬜'} ${n + 1}. ${i.cantidad || ''} ${i.descripcion}`).join('\n') +
      `\n\nFaltan ${faltan}. Responde con los números que *entregó* (ej.: 1 2 5) o *TODO*.`,
    pendiente: { accion: 'entregas', datos: { alumnoId: r.alumno.id, items: l.items.map((i) => i.id) } },
  };
}

export async function registrarEntregas(env, colegio, persona, datos, texto) {
  const t = normalizar(texto);
  const indices = /^(todo|todos|completo)$/.test(t) ? datos.items.map((_, i) => i + 1) : [...new Set((t.match(/\d+/g) || []).map(Number))];
  const ids = indices.map((n) => datos.items[n - 1]).filter(Boolean);
  if (!ids.length) return null; // no era una respuesta a la lista
  await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT OR IGNORE INTO utiles_entregas (alumno_id, item_id, registrado_por) VALUES (?, ?, ?)').bind(datos.alumnoId, id, persona.usuario.id)));
  const a = await env.DB.prepare('SELECT * FROM alumnos WHERE id = ?').bind(datos.alumnoId).first();
  const l = await listaDeAlumno(env, colegio, a);
  const faltan = l.items.filter((i) => !i.entregado);
  return { texto: `✅ Registré ${ids.length} útil(es) de ${a.nombres}. ${faltan.length ? `Le falta(n): ${faltan.map((i) => i.descripcion).join(', ')}.` : '¡Lista completa! 🎉'}` };
}

// Avisa a cada familia SOLO lo que le falta a su hijo
async function avisarFaltantes(env, colegio, persona, { consulta }) {
  let alcance;
  if (persona.rol === 'profesor') alcance = alcanceAlumnos(persona.usuario);
  else {
    const { results } = await env.DB.prepare("SELECT DISTINCT grado FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegio.id).all();
    const t = normalizar(consulta).replace(/(\d)\s*/g, '$1 ');
    const grado = results.map((x) => x.grado).find((g) => t.includes(normalizar(g).replace(/(\d)\s*/g, '$1 ').trim()));
    if (!grado) return { texto: '¿De qué grado? Ejemplo: "faltantes 3° Primaria".' };
    alcance = { sql: 'a.grado = ?', params: [grado] };
  }
  const { results: alumnos } = await env.DB.prepare(
    `SELECT a.* FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${alcance.sql}`,
  ).bind(colegio.id, ...alcance.params).all();
  const filas = [];
  for (const a of alumnos.slice(0, 60)) {
    const l = await listaDeAlumno(env, colegio, a);
    if (!l) continue;
    const faltan = l.items.filter((i) => !i.entregado);
    if (!faltan.length || faltan.length === l.items.length) continue; // sin marcar todavía: no se avisa
    const aps = await apoderadosConPermiso(env, colegio, 'a.id = ?', [a.id]);
    for (const ap of aps) {
      filas.push(env.DB.prepare('INSERT INTO wa_cola (colegio_id, telefono, apoderado_id, nombre, texto, motivo, creado_por, lote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(colegio.id, ap.telefono, ap.apoderado_id, ap.nombres.split(' ')[0],
          `a ${a.nombres} solo le falta traer: ${faltan.map((i) => `${i.cantidad || ''} ${i.descripcion}`.trim()).join(', ')}. ¡Gracias!`, 'utiles_faltantes', persona.usuario.id, `faltantes-${Date.now()}`));
    }
  }
  if (!filas.length) return { texto: 'No hay útiles faltantes por avisar (o aún no se marcó lo entregado). Marca entregas con "útiles + nombre del alumno".' };
  await env.DB.batch(filas);
  return { texto: `✅ ${filas.length} familia(s) recibirán *solo lo que le falta* a su hijo. Se envía por tandas.`, enviarCola: true };
}

/** Devuelve la respuesta si la intención es de este módulo; si no, null */
export async function responderDocente(env, colegio, persona, ctx) {
  const u = persona.usuario;
  const esDocente = persona.rol === 'profesor' || persona.rol === 'direccion';
  switch (ctx.intencion) {
    case 'notas_registrar': return esDocente ? notasPorTexto(env, colegio, persona, ctx.texto) : null;
    case 'asistencia_aula': return esDocente ? asistenciaAula(env, colegio, persona, ctx.texto) : null;
    case 'examen': return esDocente ? examen(env, colegio, persona, ctx) : null;
    case 'sesion': return esDocente ? sesion(env, colegio, persona, ctx) : null;
    case 'adaptar': return esDocente ? adaptar(env, colegio, persona, ctx) : null;
    case 'traducir': return traducirComunicado(env, ctx);
    case 'resultados': return persona.rol === 'profesor' ? resultados(env, colegio, persona, ctx) : null;
    case 'radar': return persona.rol === 'profesor' ? radar(env, colegio, persona, ctx) : null;
    case 'tutor': return persona.rol === 'profesor' ? temasTutor(env, colegio, persona) : null;
    case 'riesgo': return ['profesor', 'direccion'].includes(persona.rol) ? riesgo(env, colegio, persona) : null;
    case 'utiles': return persona.rol === 'profesor' && tiene(u, 'ficha.academico') ? utilesAlumno(env, colegio, persona, ctx) : null;
    case 'faltantes': return ['profesor', 'secretaria'].includes(persona.rol) ? avisarFaltantes(env, colegio, persona, ctx) : null;
    default: return null;
  }
}
