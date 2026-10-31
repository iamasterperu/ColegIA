// Calificar exámenes por WhatsApp con fotos. El profesor escribe "calificar 12" y manda las fotos de cada
// hoja ya revisada, en orden. Cada foto se lee al llegar. Como solo la primera hoja trae el nombre, las
// hojas sin nombre se unen al alumno anterior. Antes de guardar se muestra un resumen para corregir.
import { normalizar } from '../../lib/texto.js';
import { tiene } from '../../lib/permisos.js';
import { leerExamenCalificado, armarResultados, prepararResultados, NIVEL_TEXTO } from '../../lib/calificar.js';
import { hayIA } from '../../ia/modelo.js';
import { auditoria, leerPendiente, guardarPendiente, borrarPendiente } from '../comun.js';

export const DISPARO_FOTO = /\b(calific\w*|corregid\w*|revisad\w*)\b/i;
export const PIDE_CALIFICAR = /^\s*(calificar|corregir|calificaci[oó]n)\b/i;
const puede = (persona) => ['profesor', 'direccion'].includes(persona.rol) && tiene(persona.usuario, 'ficha.academico');

async function buscarExamen(env, colegio, persona, codigo) {
  return codigo
    ? env.DB.prepare("SELECT * FROM documentos WHERE id = ? AND colegio_id = ? AND tipo = 'examen'").bind(codigo, colegio.id).first()
    : env.DB.prepare("SELECT * FROM documentos WHERE colegio_id = ? AND tipo = 'examen' AND usuario_id = ? ORDER BY id DESC LIMIT 1").bind(colegio.id, persona.usuario.id).first();
}
const sesion = (doc) => ({ documento_id: doc.id, titulo: doc.titulo });

export async function iniciarCalificacion(env, colegio, persona, tel, texto) {
  if (!puede(persona)) return { texto: 'Solo profesores y dirección pueden calificar exámenes.' };
  const codigo = Number(texto.match(/\b(\d{1,7})\b/)?.[1]) || null;
  const doc = await buscarExamen(env, colegio, persona, codigo);
  if (!doc) return { texto: codigo ? `No encontré el examen ${codigo}.` : 'Primero crea un examen (escribe "examen de …").' };
  await env.DB.prepare('DELETE FROM calif_fotos WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, tel).run();
  await guardarPendiente(env, colegio, tel, 'calificando', sesion(doc));
  return { texto: `📸 Vamos a calificar *${doc.titulo}* (código ${doc.id}).\n\nMándame las fotos de los exámenes ya revisados, *en orden*: la hoja con el nombre primero y después las otras hojas de ese mismo alumno. Luego sigue con el siguiente alumno.\n\nCuando termines escribe *LISTO*. Para empezar de nuevo, *CANCELAR*.` };
}

export async function haySesionReciente(env, colegio, tel) {
  const f = await env.DB.prepare("SELECT documento_id FROM calif_fotos WHERE colegio_id = ? AND telefono = ? AND creado_en > datetime('now', '-20 minutes') LIMIT 1").bind(colegio.id, tel).first();
  return f?.documento_id || null;
}

export async function recibirHoja(env, colegio, persona, tel, entrada, pendiente) {
  if (!puede(persona)) return { texto: 'Solo profesores y dirección pueden calificar exámenes.' };
  if (!hayIA(env)) return { texto: 'No puedo leer fotos en este momento.' };
  const texto = entrada.texto || '';
  let docId = pendiente?.accion === 'calificando' ? pendiente.datos.documento_id : await haySesionReciente(env, colegio, tel);
  let doc;
  if (docId) doc = await env.DB.prepare("SELECT * FROM documentos WHERE id = ? AND colegio_id = ? AND tipo = 'examen'").bind(docId, colegio.id).first();
  else doc = await buscarExamen(env, colegio, persona, Number(texto.match(/\b(\d{1,7})\b/)?.[1]) || null);
  if (!doc) return { texto: 'Primero crea un examen (escribe "examen de …") y luego escribe *calificar* para mandar las fotos.' };
  await env.DB.prepare("DELETE FROM calif_fotos WHERE colegio_id = ? AND telefono = ? AND creado_en < datetime('now', '-3 hours')").bind(colegio.id, tel).run();
  // La hoja se anota primero (el orden de llegada manda) y se lee después, así varias fotos a la vez no se mezclan
  const manual = DISPARO_FOTO.test(texto) ? '' : texto.replace(/\s+/g, ' ').trim().slice(0, 80);
  const fila = await env.DB.prepare('INSERT INTO calif_fotos (colegio_id, telefono, documento_id, orden, nombre_manual) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(colegio.id, tel, doc.id, Number(entrada.ts) || Math.floor(Date.now() / 1000), manual && manual.length > 2 ? manual : null).first();
  await guardarPendiente(env, colegio, tel, 'calificando', sesion(doc));
  let lectura;
  try { lectura = await leerExamenCalificado(env, entrada.imagen, JSON.parse(doc.contenido).preguntas?.length || 0); }
  catch { lectura = { error: true }; }
  await env.DB.prepare('UPDATE calif_fotos SET lectura = ? WHERE id = ?').bind(JSON.stringify(lectura), fila.id).run();
  const { n } = await env.DB.prepare('SELECT COUNT(*) n FROM calif_fotos WHERE colegio_id = ? AND telefono = ? AND documento_id = ? AND descartada = 0').bind(colegio.id, tel, doc.id).first();
  if (lectura.error) return { texto: `⚠️ La foto ${n} no se pudo leer. Mándala otra vez con buena luz y de frente (si es de otro alumno, escribe *quitar foto ${n}* antes de seguir).` };
  const nombre = manual && manual.length > 2 ? manual : lectura.alumno;
  const detalle = nombre ? `«${nombre}»${lectura.pagina ? `, hoja ${lectura.pagina}` : ''}` : 'sin nombre → la uniré al alumno anterior';
  return { texto: `📄 Foto ${n}: ${detalle}.${n === 1 ? '\nSigue con las demás y escribe *LISTO* al terminar.' : ''}` };
}

async function cargarHojas(env, colegio, tel, docId) {
  const { results } = await env.DB.prepare(
    'SELECT id, lectura, nombre_manual FROM calif_fotos WHERE colegio_id = ? AND telefono = ? AND documento_id = ? AND descartada = 0 ORDER BY orden, id',
  ).bind(colegio.id, tel, docId).all();
  return results;
}

async function resumir(env, colegio, persona, tel, docId) {
  const doc = await env.DB.prepare("SELECT * FROM documentos WHERE id = ? AND colegio_id = ?").bind(docId, colegio.id).first();
  const hojas = await cargarHojas(env, colegio, tel, docId);
  if (!hojas.length) return { texto: 'Aún no recibí fotos. Mándalas y escribe *LISTO*.' };
  if (hojas.some((h) => h.lectura === null)) return { texto: `Todavía estoy leyendo ${hojas.filter((h) => h.lectura === null).length} foto(s). Espera unos segundos y escribe *LISTO* otra vez.` };
  const lecturas = hojas.map((h) => {
    const l = JSON.parse(h.lectura);
    return h.nombre_manual ? { ...l, alumno: h.nombre_manual } : l;
  });
  const total = JSON.parse(doc.contenido).preguntas?.length || 0;
  const grupos = await armarResultados(env, colegio.id, persona.usuario, total, lecturas);
  const vistos = new Set();
  for (const g of grupos) {
    g.guardable = g.leido && !!g.alumno_id && !vistos.has(g.alumno_id);
    g.duplicado = !!g.alumno_id && vistos.has(g.alumno_id);
    if (g.alumno_id) vistos.add(g.alumno_id);
  }
  return { doc, grupos, hojas: hojas.length };
}

const rango = (f) => (f.length === 1 ? `foto ${f[0]}` : `fotos ${f[0]}-${f[f.length - 1]}`);

export async function mostrarResumen(env, colegio, persona, tel, datos) {
  const r = await resumir(env, colegio, persona, tel, datos.documento_id);
  if (!r.grupos) return r;
  const lineas = r.grupos.map((g) => {
    if (g.duplicado) return `⚠️ ${rango(g.fotos)}: ${g.alumno_nombre} ya aparece antes. Escribe *quitar foto N* para las sobrantes.`;
    if (!g.alumno_id) return `⚠️ ${rango(g.fotos)}: no reconocí al alumno${g.nombre_leido ? ` (leí «${g.nombre_leido}»)` : ' (no hay nombre)'}. Escribe *foto ${g.fotos[0]}: Nombre Apellido*.`;
    if (g.conflicto) return `⚠️ ${g.alumno_nombre} (${rango(g.fotos)}): las hojas dicen notas distintas (${g.conflicto.join(' y ')}). Revísalo en la web.`;
    if (!g.leido) return `⚠️ ${g.alumno_nombre} (${rango(g.fotos)}): no encontré la nota. Revísalo en la web.`;
    const icono = { bueno: '✅', regular: '🟡', ayuda: '🔴' }[g.nivel];
    return `${icono} *${g.alumno_nombre}* (${rango(g.fotos)}): ${g.puntaje}/20 · ${Math.round(g.porcentaje)}% · ${NIVEL_TEXTO[g.nivel]}`;
  });
  const listos = r.grupos.filter((g) => g.guardable).length;
  const cuerpo = lineas.join('\n').slice(0, 3200);
  await guardarPendiente(env, colegio, tel, 'calificando', { ...datos, resumen: true });
  return { texto: `📋 *${r.doc.titulo}* — ${r.hojas} foto(s), ${r.grupos.length} alumno(s)\n\n${cuerpo}\n\n` +
    (listos ? `Responde *SI* para guardar los ${listos} resultado(s). ` : 'No hay resultados listos para guardar. ') +
    'Para corregir: *foto N: Nombre Apellido* o *quitar foto N*, y escribe *LISTO* de nuevo.' };
}

async function guardar(env, colegio, persona, tel, datos) {
  const r = await resumir(env, colegio, persona, tel, datos.documento_id);
  if (!r.grupos) return r;
  const filas = r.grupos.filter((g) => g.guardable).map((g) => ({ alumno_id: g.alumno_id, porcentaje: g.porcentaje, falladas: g.falladas, origen: 'whatsapp' }));
  if (!filas.length) return { texto: 'No hay resultados listos para guardar. Corrige lo marcado con ⚠️ y escribe *LISTO*.' };
  const p = await prepararResultados(env, colegio.id, persona.usuario, r.doc, filas);
  if (!p.guardados) return { texto: 'No pude guardar: esos alumnos no están en tus secciones.' };
  await env.DB.batch([...p.sentencias, auditoria(env, colegio, persona, 'registrar_resultados_examen', 'documento', r.doc.id, { alumnos: p.guardados, hojas: r.hojas })]);
  await env.DB.prepare('DELETE FROM calif_fotos WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, tel).run();
  await borrarPendiente(env, colegio, tel);
  const por = (n) => r.grupos.filter((g) => g.guardable && g.nivel === n).map((g) => g.alumno_nombre.split(' ')[0] + ' ' + (g.alumno_nombre.split(' ').slice(-1)[0] || '')).slice(0, 10);
  const partes = [['🔴 Necesitan ayuda', por('ayuda')], ['🟡 Conviene reforzar', por('regular')], ['✅ Buena nota', por('bueno')]]
    .filter(([, l]) => l.length).map(([t, l]) => `${t}: ${l.join(', ')}`);
  return { texto: `✅ Guardé ${p.guardados} resultado(s) de *${r.doc.titulo}*.\n\n${partes.join('\n')}\n\nEscribe *radar* para ver los temas débiles del aula.` };
}

// Mensajes de texto mientras hay una calificación en curso. Devuelve null si el texto no es para esto.
export async function continuarCalificacion(env, colegio, persona, tel, texto, pendiente) {
  const t = normalizar(texto);
  const datos = pendiente.datos;
  if (/^(cancelar|cancela|salir|olvidalo|anular)$/.test(t)) {
    await env.DB.prepare('DELETE FROM calif_fotos WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, tel).run();
    await borrarPendiente(env, colegio, tel);
    return { texto: 'Cancelado. No guardé nada.' };
  }
  if (/^(listo|lista|termine|terminamos|termino|ya|ya esta|eso es todo|fin|resumen)$/.test(t)) return mostrarResumen(env, colegio, persona, tel, datos);
  if (datos.resumen && /^(si|sí|ok|guardar|guarda|confirmo|dale)$/.test(t)) return guardar(env, colegio, persona, tel, datos);
  if (datos.resumen && t === 'no') { await guardarPendiente(env, colegio, tel, 'calificando', { ...datos, resumen: false }); return { texto: 'Entendido, no guardé nada. Corrige lo que haga falta y escribe *LISTO*, o *CANCELAR*.' }; }
  let m = t.match(/^(?:quitar|borrar|eliminar)\s+foto\s*(\d+)$/);
  if (m) {
    const hojas = await cargarHojas(env, colegio, tel, datos.documento_id);
    const h = hojas[Number(m[1]) - 1];
    if (!h) return { texto: `No tengo la foto ${m[1]}.` };
    await env.DB.prepare('UPDATE calif_fotos SET descartada = 1 WHERE id = ?').bind(h.id).run();
    return { texto: `Quité la foto ${m[1]}. Ojo: las fotos siguientes se renumeran. Escribe *LISTO* para ver el resumen.` };
  }
  m = texto.match(/^\s*foto\s*(\d+)\s*[:\-]\s*(.{3,80})$/i);
  if (m) {
    const hojas = await cargarHojas(env, colegio, tel, datos.documento_id);
    const h = hojas[Number(m[1]) - 1];
    if (!h) return { texto: `No tengo la foto ${m[1]}.` };
    await env.DB.prepare('UPDATE calif_fotos SET nombre_manual = ? WHERE id = ?').bind(m[2].trim(), h.id).run();
    return { texto: `Anotado: la foto ${m[1]} es de ${m[2].trim()}. Las hojas siguientes sin nombre se unirán a ese alumno. Escribe *LISTO* para ver el resumen.` };
  }
  return null;
}
