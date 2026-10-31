// Calificación de exámenes por foto: la IA lee el examen ya revisado por el profesor
// (nombre del alumno y nota o preguntas falladas) y ColegIA calcula nota, porcentaje y nivel.
import { leerImagen } from '../ia/modelo.js';

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
export function interpretarLectura(l, totalPreguntas) {
  const incorrectas = Array.isArray(l?.preguntas_incorrectas)
    ? [...new Set(l.preguntas_incorrectas.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= totalPreguntas))] : [];
  let pct = null;
  let falladas = null;
  if (incorrectas.length && totalPreguntas) { falladas = incorrectas; pct = ((totalPreguntas - incorrectas.length) / totalPreguntas) * 100; }
  else if (Number(l?.correctas) >= 0 && Number(l?.total) > 0 && Number(l.correctas) <= Number(l.total)) pct = (Number(l.correctas) / Number(l.total)) * 100;
  else pct = porNotaEscrita(l?.nota_escrita);
  if (pct === null) return null;
  pct = redondear(limitar(pct));
  if (pct === 100) falladas = [];
  return { porcentaje: pct, puntaje: redondear((pct / 100) * 20), nivel: nivelDe(pct), falladas, sin_detalle: falladas ? 0 : 1, nota_escrita: l?.nota_escrita ?? null };
}

export async function leerExamenCalificado(env, imagen, totalPreguntas) {
  const r = await leerImagen(env, imagen,
    `Es la foto de un examen escolar ya revisado por el profesor (el examen tiene ${totalPreguntas} preguntas). Responde {"alumno":"nombre completo escrito en el examen o null","nota_escrita":"la calificación que escribió el profesor tal como aparece (por ejemplo 15, 15/20, 80%, AD) o null","correctas":número de respuestas correctas si se puede contar o null,"total":total de preguntas si aparece o null,"preguntas_incorrectas":[números de las preguntas marcadas como incorrectas, o null si no se marcan]}. Copia exactamente lo que ves; si algo no se lee, usa null.`,
    { json: true, maxTokens: 500 });
  return { alumno: String(r?.alumno || '').trim().slice(0, 80), ...r };
}
