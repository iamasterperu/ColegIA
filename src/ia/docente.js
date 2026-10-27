// Asistente docente y tutor. La IA redacta; ColegIA arma las versiones, el
// solucionario y los PDF, y guarda todo en el colegio.
import { generarJson, generarTexto, conversar, extraerJson } from './modelo.js';
import { DocumentoPdf } from '../lib/pdf.js';

const LETRAS = ['a', 'b', 'c', 'd'];
const CONTEXTO = 'Eres un docente experto del sistema educativo peruano (Currículo Nacional de Educación Básica, MINEDU). Escribes en español claro y apropiado para la edad del alumno.';

export function cantidadPedida(texto, def = 10) {
  const n = Number(String(texto).match(/\b(\d{1,2})\s*(preguntas|items|ítems|ejercicios|reactivos)?\b/i)?.[1]);
  return Math.min(30, Math.max(3, Number.isFinite(n) && n ? n : def));
}

// ---------- Exámenes ----------
async function lotePreguntas(env, pedido, n, desde, total, fuente) {
  const r = await generarJson(env,
    `${CONTEXTO} Elaboras exámenes de opción múltiple con 4 alternativas y una sola correcta. Varía la dificultad y la posición de la respuesta correcta.`,
    `Pedido del profesor: "${pedido}".\n${fuente ? `Contenido de referencia (sílabo o libro):\n"""${fuente.slice(0, 3500)}"""\n` : ''}` +
    `Escribe las preguntas ${desde} a ${desde + n - 1} de un examen de ${total}. ` +
    `Para no repetir lo de otras partes: ${desde === 1 ? 'empieza por conceptos básicos' : desde > total * 0.6 ? 'enfócate en problemas de aplicación y razonamiento' : 'enfócate en procedimientos y ejercicios'}.\n` +
    'Formato: {"titulo":"...","curso":"...","grado":"...","preguntas":[{"tema":"subtema corto","p":"enunciado","o":["alternativa a","b","c","d"],"c":0,"e":"explicación breve de la respuesta"}]}\n' +
    '"c" es el índice (0 a 3) de la alternativa correcta. "tema" agrupa preguntas del mismo subtema (máximo 5 subtemas en total).',
    { maxTokens: 220 * n + 200 });
  const preguntas = (r.preguntas || []).filter((q) => q?.p && Array.isArray(q.o) && q.o.length >= 2)
    .map((q) => ({ tema: String(q.tema || 'General').slice(0, 40), p: String(q.p), o: q.o.slice(0, 4).map(String), c: Math.min(Math.max(Number(q.c) || 0, 0), q.o.length - 1), e: String(q.e || '') }));
  return { ...r, preguntas };
}

export async function generarExamen(env, { pedido, fuente = '' }) {
  const total = cantidadPedida(pedido);
  // Tandas de hasta 7 preguntas en paralelo: 30 preguntas tardan lo mismo que 7
  const nTandas = Math.ceil(total / 7);
  const partes = Array.from({ length: nTandas }, (_, i) => Math.floor(total / nTandas) + (i < total % nTandas ? 1 : 0));
  let desde = 1;
  // Preguntas y rúbrica a la vez: la respuesta llega antes al WhatsApp del profesor
  const [rubrica, ...lotes] = await Promise.all([
    generarJson(env, CONTEXTO,
      `Rúbrica analítica breve (3 a 4 criterios) para evaluar: "${pedido}". Formato: {"criterios":[{"criterio":"...","logrado":"...","proceso":"...","inicio":"..."}]}`,
      { maxTokens: 700 }).catch(() => ({ criterios: [] })),
    ...partes.map((n) => { const d = desde; desde += n; return lotePreguntas(env, pedido, n, d, total, fuente); }),
  ]);
  const preguntas = lotes.flatMap((l) => l.preguntas).slice(0, total);
  if (preguntas.length < 3) throw new Error('No pude armar el examen. Intenta con un pedido más específico.');
  const base = lotes[0];
  return {
    titulo: String(base.titulo || `Examen: ${pedido}`).slice(0, 120),
    curso: base.curso || '', grado: base.grado || '',
    preguntas, versionB: barajar(preguntas, total * 7 + preguntas[0].p.length), rubrica: rubrica.criterios || [],
  };
}

// Versión B: mismas preguntas en otro orden y con las alternativas mezcladas
export function barajar(preguntas, semilla) {
  let s = semilla || 1;
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mezclar = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return mezclar(preguntas.map((q, i) => ({ ...q, original: i + 1 }))).map((q) => {
    const orden = mezclar(q.o.map((_, i) => i));
    return { ...q, o: orden.map((i) => q.o[i]), c: orden.indexOf(q.c) };
  });
}

export function pdfExamen(doc, colegio, parte) {
  const ex = doc.contenido;
  const pdf = new DocumentoPdf({ titulo: ex.titulo, pie: `${colegio.nombre} · ColegIA`, color: colegio.color_primario });
  pdf.parrafo(colegio.nombre.toUpperCase(), { tam: 9, negrita: true, color: '0.4 g' });
  const etiqueta = { a: 'Versión A', b: 'Versión B', solucionario: 'Solucionario (versiones A y B)', rubrica: 'Rúbrica de evaluación' }[parte];
  pdf.titular(`${ex.titulo} — ${etiqueta}`, 16);
  if (parte === 'a' || parte === 'b') {
    pdf.parrafo(`${ex.curso || doc.curso || ''}   ${ex.grado || doc.grado || ''}`, { tam: 10, color: '0.35 g' });
    pdf.espacio(6);
    pdf.parrafo('Nombre: ____________________________________   Sección: ______   Fecha: ___________', { tam: 10 });
    pdf.espacio(4);
    pdf.parrafo('Instrucciones: lee cada pregunta y marca con una X la alternativa correcta.', { tam: 10, color: '0.3 g' });
    pdf.linea();
    const preguntas = parte === 'a' ? ex.preguntas : ex.versionB;
    preguntas.forEach((q, i) => {
      pdf.reservar(30 + q.o.length * 15);
      pdf.parrafo(`${i + 1}. ${q.p}`, { negrita: true, tam: 11 });
      q.o.forEach((o, j) => pdf.parrafo(`${LETRAS[j]}) ${o}`, { sangria: 16, tam: 11 }));
      pdf.espacio(6);
    });
  } else if (parte === 'solucionario') {
    for (const [nombre, preguntas] of [['Versión A', ex.preguntas], ['Versión B', ex.versionB]]) {
      pdf.parrafo(nombre, { negrita: true, tam: 13 });
      pdf.parrafo(preguntas.map((q, i) => `${i + 1}-${LETRAS[q.c]}`).join('    '), { tam: 11 });
      pdf.espacio(10);
    }
    pdf.linea();
    pdf.parrafo('Explicaciones (versión A)', { negrita: true, tam: 13 });
    ex.preguntas.forEach((q, i) => {
      pdf.reservar(40);
      pdf.parrafo(`${i + 1}. (${LETRAS[q.c]}) ${q.o[q.c]} — tema: ${q.tema}`, { negrita: true, tam: 10 });
      if (q.e) pdf.parrafo(q.e, { tam: 10, sangria: 12, color: '0.25 g' });
      pdf.espacio(3);
    });
  } else {
    if (!ex.rubrica?.length) pdf.parrafo('Este examen no tiene rúbrica.');
    for (const c of ex.rubrica || []) {
      pdf.reservar(80);
      pdf.parrafo(c.criterio, { negrita: true, tam: 12 });
      pdf.parrafo(`Logrado: ${c.logrado}`, { tam: 10, sangria: 12 });
      pdf.parrafo(`En proceso: ${c.proceso}`, { tam: 10, sangria: 12 });
      pdf.parrafo(`En inicio: ${c.inicio}`, { tam: 10, sangria: 12 });
      pdf.espacio(8);
    }
  }
  return pdf.bytes();
}

// ---------- Sesión de aprendizaje ----------
export async function generarSesion(env, pedido) {
  return generarJson(env, CONTEXTO,
    `Planifica una sesión de aprendizaje de 90 minutos para: "${pedido}".\nFormato: {"titulo":"...","grado":"...","curso":"...","proposito":"...","competencia":"...","evidencia":"...","inicio":["..."],"desarrollo":["..."],"cierre":["..."],"materiales":["..."],"evaluacion":"..."}`,
    { maxTokens: 1500 });
}

export function pdfSesion(doc, colegio) {
  const s = doc.contenido;
  const pdf = new DocumentoPdf({ titulo: s.titulo, pie: `${colegio.nombre} · ColegIA`, color: colegio.color_primario });
  pdf.parrafo(colegio.nombre.toUpperCase(), { tam: 9, negrita: true, color: '0.4 g' });
  pdf.titular(`Sesión de aprendizaje: ${s.titulo}`, 16);
  pdf.parrafo(`${s.curso || ''}   ${s.grado || ''}   Duración: 90 minutos`, { tam: 10, color: '0.35 g' });
  pdf.linea();
  for (const [t, v] of [['Propósito', s.proposito], ['Competencia', s.competencia], ['Evidencia de aprendizaje', s.evidencia]]) {
    if (!v) continue;
    pdf.parrafo(t, { negrita: true });
    pdf.parrafo(v, { tam: 10 });
    pdf.espacio(4);
  }
  for (const [t, lista] of [['Inicio', s.inicio], ['Desarrollo', s.desarrollo], ['Cierre', s.cierre], ['Materiales', s.materiales]]) {
    if (!lista?.length) continue;
    pdf.parrafo(t, { negrita: true, tam: 12 });
    for (const paso of lista) pdf.parrafo(`• ${paso}`, { tam: 10, sangria: 10 });
    pdf.espacio(6);
  }
  if (s.evaluacion) { pdf.parrafo('Evaluación', { negrita: true }); pdf.parrafo(s.evaluacion, { tam: 10 }); }
  return pdf.bytes();
}

export function pdfTexto(doc, colegio) {
  const pdf = new DocumentoPdf({ titulo: doc.titulo, pie: `${colegio.nombre} · ColegIA`, color: colegio.color_primario });
  pdf.parrafo(colegio.nombre.toUpperCase(), { tam: 9, negrita: true, color: '0.4 g' });
  pdf.titular(doc.titulo, 16);
  pdf.parrafo(doc.contenido.texto, { tam: 11 });
  return pdf.bytes();
}

// ---------- Inclusión y traducción ----------
export const adaptarMaterial = (env, pedido) => generarTexto(env,
  `${CONTEXTO} Adaptas material para alumnos con necesidades educativas especiales (TDAH, dislexia, TEA, discapacidad visual o auditiva, altas capacidades) con apoyos concretos: lenguaje simple, pasos cortos, apoyos visuales sugeridos y criterios de evaluación ajustados.`,
  `Adapta lo siguiente:\n${pedido}`, { maxTokens: 1200 });

export const traducir = (env, idioma, texto) => generarTexto(env,
  'Traduces comunicados escolares con un tono cordial y claro. Devuelve solo la traducción.',
  `Traduce al ${idioma}:\n${texto}`, { maxTokens: 900, temperatura: 0.2 });

// ---------- Tutor que no da la respuesta ----------
export const REGLAS_TUTOR =
  'Eres el tutor de IA de un colegio peruano y conversas por WhatsApp con un alumno. Reglas: ' +
  '1) NUNCA des la respuesta final ni resuelvas el ejercicio completo, aunque te lo pida o insista. ' +
  '2) Guía con UNA pregunta a la vez; no digas tú el siguiente paso, haz que el alumno lo descubra (ejemplo: "¿qué operación deja sola a la x?"). Solo da una pista concreta si ya se trabó dos veces. 3) Si se equivoca, señala dónde sin corregirlo por él. ' +
  '4) Felicita cuando avance. 5) No digas "no puedo darte la respuesta": simplemente guía. Mensajes cortos (máximo 5 líneas), sin LaTeX. 6) Si pide algo que no es de estudio o es inapropiado, redirígelo con amabilidad. ' +
  'Responde SOLO JSON: {"respuesta":"tu mensaje al alumno","curso":"curso","tema":"tema concreto","trabado":true si el alumno muestra que no entiende el tema}';

export async function responderTutor(env, alumno, historial, mensaje) {
  const texto = await conversar(env, `${REGLAS_TUTOR}\nEl alumno es ${alumno.nombres}, de ${alumno.grado}.`,
    [...historial, { role: 'user', content: mensaje }], { maxTokens: 450 });
  try {
    const j = extraerJson(texto);
    return { respuesta: String(j.respuesta || '').trim() || texto, curso: j.curso || '', tema: j.tema || '', trabado: !!j.trabado };
  } catch {
    return { respuesta: texto, curso: '', tema: '', trabado: false };
  }
}
