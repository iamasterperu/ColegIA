// Tutor que no da la respuesta: el alumno escribe (o manda foto del ejercicio) y la IA
// lo guía con preguntas. Cada tema queda registrado para su profesor (radar y alertas).
import { responderTutor } from '../../ia/docente.js';
import { hayIA, leerImagen, SinIA } from '../../ia/modelo.js';

export const menuAlumno = (persona, colegio) =>
  `Hola ${persona.nombre} 👋, soy tu *tutor de IA* de ${colegio.nombre}.\n` +
  'Mándame tu duda o la *foto del ejercicio* y lo resolvemos juntos, paso a paso. ' +
  'No te voy a dar la respuesta: te ayudo a que llegues tú 💪.\n\nEscribe *NUEVO TEMA* para empezar otra duda.';

async function historial(env, colegio, telefono) {
  const { results } = await env.DB.prepare(
    `SELECT sentido, COALESCE(texto, transcripcion) AS texto FROM mensajes
      WHERE colegio_id = ? AND telefono = ? AND creado_en >= datetime('now', '-6 hours') ORDER BY id DESC LIMIT 12`,
  ).bind(colegio.id, telefono).all();
  const lista = [];
  for (const m of results) {
    if (/^nuevo tema$/i.test(String(m.texto).trim())) break;
    lista.unshift({ role: m.sentido === 'entrante' ? 'user' : 'assistant', content: String(m.texto || '').slice(0, 800) });
  }
  return lista.slice(0, -1); // el último entrante es el mensaje actual
}

export async function responderAlumno(env, colegio, persona, { texto, imagen, telefono }) {
  const a = persona.alumno;
  if (/^(hola|menu|menú|ayuda|nuevo tema)\b/i.test(texto.trim()) && !imagen) return { texto: menuAlumno(persona, colegio) };
  if (!hayIA(env)) return { texto: 'El tutor no está disponible en este momento. Inténtalo en unos minutos 🙏' };
  try {
    let mensaje = texto;
    if (imagen) {
      const leido = await leerImagen(env, imagen, 'Transcribe el ejercicio o pregunta escolar de esta foto, tal como está escrito. No lo resuelvas.', { maxTokens: 600 });
      mensaje = `${texto ? `${texto}\n` : ''}(Foto del ejercicio): ${leido}`;
    }
    const r = await responderTutor(env, a, await historial(env, colegio, telefono), mensaje);
    if (r.tema) {
      await env.DB.prepare('INSERT INTO tutor_temas (colegio_id, alumno_id, curso, tema, trabado) VALUES (?, ?, ?, ?, ?)')
        .bind(colegio.id, a.id, String(r.curso).slice(0, 60), String(r.tema).slice(0, 80), r.trabado ? 1 : 0).run();
    }
    return { texto: r.respuesta.slice(0, 1500) };
  } catch (e) {
    if (e instanceof SinIA) return { texto: 'El tutor no está disponible en este momento.' };
    return { texto: 'Uy, me enredé 😅. ¿Me lo escribes de nuevo con un poco más de detalle?' };
  }
}
