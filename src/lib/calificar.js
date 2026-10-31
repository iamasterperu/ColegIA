// Calificación de exámenes por foto: la IA lee el examen ya revisado por el profesor
// (nombre del alumno y nota o preguntas falladas) y ColegIA calcula nota, porcentaje y nivel.
import { leerImagen } from '../ia/modelo.js';
import { normalizar } from './texto.js';
import { alcanceAlumnos } from './permisos.js';
import { buscarAlumnos } from '../whatsapp/comun.js';
import { cursoOficial, bimestreActual } from '../whatsapp/roles/registro.js';

export const nivelDe = (pct) => (pct >= 70 ? 'bueno' : pct >= 50 ? 'regular' : 'ayuda');
export const NIVEL_TEXTO = { bueno: 'Buena nota', regular: 'Regular: conviene reforzar', ayuda: 'Necesita ayuda' };
const LETRAS = { AD: 95, A: 85, B: 60, C: 35 };
const redondear = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const limitar = (n) => Math.min(100, Math.max(0, n));

function porNotaEscrita(texto) {
  const t = String(texto ?? '').trim().toUpperCase().replace(',', '.');
  if (!t) return null;
  if (LETRAS[t]) return LETRAS[t];
  let m = t.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return limitar(Number(m[1]));
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:\/|SOBRE|DE)\s*(\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) > 0) return limitar((Number(m[1]) / Number(m[2])) * 100);
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) { const n = Number(m[1]); return n <= 20 ? limitar((n / 20) * 100) : n <= 100 ? n : null; }
  return null;
}

// l = lectura de la IA. Prioridad: preguntas falladas > correctas/total > nota escrita.
export function interpretarLectura(l, totalPreguntas, { preferirNota = false } = {}) {
  const incorrectas = Array.isArray(l?.preguntas_incorrectas)
    ? [...new Set(l.preguntas_incorrectas.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= totalPreguntas))] : [];
  let pct = null;
  let falladas = null;
  if (incorrectas.length && totalPreguntas) { falladas = incorrectas; pct = ((totalPreguntas - incorrectas.length) / totalPreguntas) * 100; }
  if (preferirNota && porNotaEscrita(l?.nota_escrita) !== null) pct = porNotaEscrita(l.nota_escrita);
  else if (pct !== null) { /* ya calculado con las preguntas marcadas */ }
  else if (Number(l?.correctas) >= 0 && Number(l?.total) > 0 && Number(l.correctas) <= Number(l.total)) pct = (Number(l.correctas) / Number(l.total)) * 100;
  else pct = porNotaEscrita(l?.nota_escrita);
  if (pct === null) return null;
  pct = redondear(limitar(pct));
  if (pct === 100) falladas = [];
  return { porcentaje: pct, puntaje: redondear((pct / 100) * 20), nivel: nivelDe(pct), falladas, sin_detalle: falladas ? 0 : 1, nota_escrita: l?.nota_escrita ?? null };
}

export async function leerExamenCalificado(env, imagen, totalPreguntas) {
  const r = await leerImagen(env, imagen,
    `Es la foto de UNA hoja de un examen escolar ya revisado por el profesor (el examen completo tiene ${totalPreguntas} preguntas y puede tener varias hojas). Responde {"alumno":"nombre completo escrito en el examen o null","nota_escrita":"la calificación que escribió el profesor tal como aparece (por ejemplo 15, 15/20, 80%, AD) o null","correctas":número de respuestas correctas si se puede contar o null,"total":total de preguntas si aparece o null,"preguntas_incorrectas":[números de las preguntas marcadas como incorrectas, o null si no se marcan],"pagina":número de hoja si aparece escrito (Hoja 2, 2/3) o null,"es_nota_final":true si la nota escrita es la calificación total del examen y no el puntaje parcial de una hoja}. El nombre del alumno suele estar solo en la primera hoja: si no aparece, usa null. Copia exactamente lo que ves; si algo no se lee, usa null.`,
    { json: true, maxTokens: 500 });
  return { alumno: String(r?.alumno || '').trim().slice(0, 80), ...r };
}

// ---------- Varias hojas por alumno ----------
// Solo la primera hoja suele traer el nombre. Regla: una hoja con un nombre distinto abre un alumno nuevo;
// una hoja sin nombre se une al alumno anterior. Los nombres se comparan sin exigir que sean idénticos.
const mismoNombre = (a, b) => {
  const x = normalizar(a).split(' ').filter((p) => p.length > 1);
  const y = normalizar(b).split(' ').filter((p) => p.length > 1);
  if (!x.length || !y.length) return false;
  const comunes = x.filter((p) => y.includes(p)).length;
  return comunes >= Math.min(2, Math.min(x.length, y.length)) ;
};

export function agruparPaginas(lecturas) {
  const grupos = [];
  let actual = null;
  lecturas.forEach((l, i) => {
    const nombre = String(l?.alumno || '').trim();
    const primera = Number(l?.pagina) === 1;
    let nuevo;
    if (!actual || l?.error) nuevo = true; // una foto que no se pudo leer nunca se une al alumno anterior
    else if (nombre) nuevo = !actual.nombre || !mismoNombre(nombre, actual.nombre) || (primera && actual.tienePrimera);
    else nuevo = primera; // hoja sin nombre: sigue con el alumno anterior, salvo que diga "hoja 1"
    if (nuevo) { actual = { nombre, paginas: [], lecturas: [], tienePrimera: false }; grupos.push(actual); }
    if (!actual.nombre && nombre) actual.nombre = nombre;
    if (primera) actual.tienePrimera = true;
    actual.paginas.push(i + 1);
    actual.lecturas.push(l || {});
  });
  return grupos.map(({ tienePrimera, ...g }) => g);
}

// Une las hojas de un alumno: nota final escrita > preguntas marcadas en todas las hojas > suma de aciertos > nota suelta
export function combinarHojas(lecturas, totalPreguntas) {
  const incorrectas = [...new Set(lecturas.flatMap((l) => (Array.isArray(l.preguntas_incorrectas) ? l.preguntas_incorrectas.map(Number) : [])))];
  const finales = lecturas.filter((l) => l.es_nota_final && String(l.nota_escrita ?? '').trim());
  const sueltas = [...new Set(lecturas.map((l) => String(l.nota_escrita ?? '').trim()).filter(Boolean))];
  const conteo = lecturas.filter((l) => Number(l.total) > 0 && Number(l.correctas) >= 0);
  const base = { preguntas_incorrectas: incorrectas.length ? incorrectas : null };
  if (finales.length) return { ...interpretarLectura({ ...base, nota_escrita: finales[finales.length - 1].nota_escrita }, totalPreguntas, { preferirNota: true }) };
  if (incorrectas.length) return interpretarLectura(base, totalPreguntas);
  if (conteo.length) return interpretarLectura({ correctas: conteo.reduce((a, l) => a + Number(l.correctas), 0), total: conteo.reduce((a, l) => a + Number(l.total), 0) }, totalPreguntas);
  if (sueltas.length === 1) return interpretarLectura({ nota_escrita: sueltas[0] }, totalPreguntas);
  if (sueltas.length > 1) return { conflicto: sueltas };
  return null;
}

// Agrupa las hojas, reconoce a cada alumno (solo los del alcance del usuario) y calcula nota, porcentaje y nivel
export async function armarResultados(env, colegioId, usuario, totalPreguntas, lecturas) {
  const colegio = { id: colegioId };
  const grupos = agruparPaginas(lecturas);
  const salida = [];
  for (const g of grupos) {
    let candidatos = [];
    if (g.nombre) candidatos = await buscarAlumnos(env, colegio, { usuario }, g.nombre, 5);
    const calculo = combinarHojas(g.lecturas, totalPreguntas);
    salida.push({
      fotos: g.paginas, nombre_leido: g.nombre, alumno_id: candidatos.length === 1 ? candidatos[0].id : null,
      alumno_nombre: candidatos.length === 1 ? `${candidatos[0].nombres} ${candidatos[0].apellidos}` : null,
      candidatos: candidatos.map((a) => a.id),
      leido: !!calculo && !calculo.conflicto, conflicto: calculo?.conflicto || null, ...(calculo && !calculo.conflicto ? calculo : {}),
    });
  }
  return salida;
}

// Sentencias para guardar resultados ya revisados (web y WhatsApp usan lo mismo)
export async function prepararResultados(env, colegioId, usuario, doc, filas, { guardarNota = false } = {}) {
  const total = JSON.parse(doc.contenido).preguntas?.length || 0;
  const al = alcanceAlumnos(usuario);
  const ids = [...new Set(filas.map((f) => Number(f.alumno_id)))].filter((n) => Number.isInteger(n) && n > 0);
  const { results: validos } = ids.length ? await env.DB.prepare(
    `SELECT a.id FROM alumnos a WHERE a.colegio_id = ? AND a.id IN (${ids.map(() => '?').join(',')}) AND ${al.sql}`,
  ).bind(colegioId, ...ids, ...al.params).all() : { results: [] };
  const permitidos = new Set(validos.map((v) => v.id));
  const curso = guardarNota ? await cursoOficial(env, colegio0(colegioId), doc.curso || 'General') : null;
  const bimestre = bimestreActual();
  const sentencias = [];
  const guardados = [];
  for (const f of filas) {
    const id = Number(f.alumno_id);
    const pct = Number(f.porcentaje);
    if (!permitidos.has(id) || !Number.isFinite(pct) || pct < 0 || pct > 100 || guardados.includes(id)) continue;
    const falladas = Array.isArray(f.falladas) ? [...new Set(f.falladas.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= total))] : null;
    const porcentaje = Math.round(pct * 10) / 10;
    const puntaje = Math.round((porcentaje / 100) * 200) / 10;
    sentencias.push(env.DB.prepare(
      `INSERT INTO examen_resultados (documento_id, alumno_id, falladas, puntaje, registrado_por, porcentaje, nivel, sin_detalle, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(documento_id, alumno_id) DO UPDATE SET falladas = excluded.falladas, puntaje = excluded.puntaje, registrado_por = excluded.registrado_por,
         porcentaje = excluded.porcentaje, nivel = excluded.nivel, sin_detalle = excluded.sin_detalle, origen = excluded.origen`,
    ).bind(doc.id, id, JSON.stringify(falladas || []), puntaje, usuario.id, porcentaje, nivelDe(porcentaje), falladas ? 0 : 1, f.origen || 'foto'));
    if (curso) {
      sentencias.push(env.DB.prepare(
        `INSERT INTO notas (colegio_id, alumno_id, curso, bimestre, nota) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(alumno_id, curso, bimestre) DO UPDATE SET nota = excluded.nota`,
      ).bind(colegioId, id, curso, bimestre, String(Math.round(puntaje))));
    }
    guardados.push(id);
  }
  return { sentencias, guardados: guardados.length, nota_bimestre: curso ? { curso, bimestre } : null };
}
const colegio0 = (id) => ({ id });
