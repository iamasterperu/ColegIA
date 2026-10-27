// Atención a familias interesadas (números no registrados) e informes generales del colegio.
// Solo responde con lo que el colegio aprobó. Guarda nombre y celular únicamente si la familia los da.
import { normalizar } from '../../lib/texto.js';
import { guardarPendiente, borrarPendiente } from '../comun.js';

export const CLAVES_INFO = {
  pension: 'Pensiones y matrícula', horarios: 'Horarios de ingreso, salida y atención', calendario: 'Calendario del año',
  utiles: 'Lista de útiles por nivel', pagos: 'Fechas y formas de pago', requisitos: 'Trámites y requisitos de admisión', visitas: 'Horarios para visitas',
};

const MENU = ['1️⃣ Pensiones y matrícula', '2️⃣ Horarios', '3️⃣ Requisitos de admisión', '4️⃣ Agendar una visita', '5️⃣ Hablar con secretaría'].join('\n');

export async function infoColegio(env, colegio) {
  const { results } = await env.DB.prepare('SELECT clave, valor FROM info_colegio WHERE colegio_id = ?').bind(colegio.id).all();
  return Object.fromEntries(results.map((f) => [f.clave, f.valor]));
}

async function faqRespuesta(env, colegio, t) {
  const { results } = await env.DB.prepare('SELECT palabras, respuesta FROM faq WHERE colegio_id = ?').bind(colegio.id).all();
  for (const f of results) {
    if (normalizar(f.palabras).split(' ').some((k) => k.length > 2 && t.includes(k))) return f.respuesta;
  }
  return null;
}

// Informes generales para cualquier persona del colegio (padres, personal). Devuelve texto o null.
export async function informeGeneral(env, colegio, t) {
  const info = await infoColegio(env, colegio);
  const dato = (clave, titulo) => (info[clave] ? `${titulo}\n${info[clave]}` : null);
  if (/\b(calendario|feriado|feriados|vacaciones|actividades del ano|cuando empiezan las clases)\b/.test(t)) return dato('calendario', '📅 *Calendario*');
  if (/\b(horario|horarios|hora de ingreso|hora de salida|a que hora)\b/.test(t)) return dato('horarios', '🕗 *Horarios*');
  if (/\b(constancia|constancias|certificado|traslado|tramite|tramites|requisitos)\b/.test(t)) return dato('requisitos', '📄 *Trámites y requisitos*');
  if (/\b(fecha de pago|fechas de pago|como pago|donde pago|formas de pago|cuando vence)\b/.test(t)) return dato('pagos', '💳 *Pagos*');
  return await faqRespuesta(env, colegio, t);
}

export const BIENVENIDA_FAMILIA = (colegio) =>
  `¡Hola! 👋 Soy el asistente virtual de *${colegio.nombre}*. Respondo con la información que el colegio ha aprobado.\n` +
  'Si me das tu nombre o celular, los usamos solo para atender tu consulta.\n\n¿En qué te ayudo?\n' + MENU;

// Conversación de la familia interesada. estado = datos guardados en wa_pendientes (o null al comenzar).
export async function responderFamilia(env, colegio, tel, texto, estado) {
  const t = normalizar(texto);
  const info = await infoColegio(env, colegio);
  const fin = colegio.es_demo ? { paso: 'menu' } : null; // en la demo la familia sigue en su conversación
  const seguir = (r, nuevo) => (nuevo ? guardarPendiente(env, colegio, tel, 'adm', nuevo).then(() => r) : borrarPendiente(env, colegio, tel).then(() => r));

  if (estado?.paso === 'nombre') {
    const nombre = texto.trim().slice(0, 80);
    if (nombre.length < 2) return seguir('¿Cuál es tu nombre?', estado);
    return seguir('Gracias, ' + nombre.split(' ')[0] + '. ¿Para qué grado te interesa el colegio? (por ejemplo: 3 años, 2.° de primaria)', { paso: 'grado', nombre });
  }
  if (estado?.paso === 'grado') {
    const grado = texto.trim().slice(0, 40);
    const horarios = (info.visitas || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    if (!horarios.length) {
      await guardarLead(env, colegio, tel, estado.nombre, grado);
      return seguir('Anotamos tu interés. Secretaría te contactará en horario de atención para coordinar la visita.', fin);
    }
    return seguir('Estos son los horarios disponibles para la visita:\n' + horarios.map((h, i) => `${i + 1}️⃣ ${h}`).join('\n') + '\n\nResponde con el número.', { paso: 'horario', nombre: estado.nombre, grado, horarios });
  }
  if (estado?.paso === 'horario') {
    const n = Number(t);
    const h = estado.horarios[n - 1];
    if (!h) return seguir('Responde con el número del horario que prefieres.', estado);
    const lead = await guardarLead(env, colegio, tel, estado.nombre, estado.grado);
    await env.DB.prepare('INSERT INTO visitas (colegio_id, lead_id, horario) VALUES (?, ?, ?)').bind(colegio.id, lead, h).run();
    return seguir(`✅ Listo, ${estado.nombre.split(' ')[0]}. Te esperamos: *${h}* en ${colegio.nombre}.${colegio.direccion ? '\n📍 ' + colegio.direccion : ''}\nSi necesitas cambiarla, escríbenos por aquí.`, fin);
  }

  if (/^(1|pension|pensiones|matricula|costo|precio|cuanto)\b/.test(t) || /\b(pension|pensiones|matricula|costo)\b/.test(t)) return info.pension ? `💰 *Pensiones y matrícula*\n${info.pension}` : 'Esa información la brinda secretaría. ¿Quieres que te contacten? Escribe *5*.';
  if (/^(2|horario|horarios)\b/.test(t)) return info.horarios ? `🕗 *Horarios*\n${info.horarios}` : 'Los horarios los confirma secretaría. Escribe *5* para que te contacten.';
  if (/^(3|requisitos|admision|postular|vacantes)\b/.test(t) || /\b(requisitos|admision|postular)\b/.test(t)) return info.requisitos ? `📄 *Admisión*\n${info.requisitos}` : 'Los requisitos los confirma secretaría. Escribe *5*.';
  if (/^(4|visita|agendar|conocer|cita)\b/.test(t) || /\b(visita|agendar|conocer el colegio)\b/.test(t)) {
    await guardarPendiente(env, colegio, tel, 'adm', { paso: 'nombre' });
    return 'Con gusto. ¿Cuál es tu nombre?';
  }
  if (/^(5|secretaria|hablar|persona|humano|llamar)\b/.test(t)) {
    await guardarLead(env, colegio, tel, 'Pidió hablar con secretaría', null);
    return { texto: 'Avisé a secretaría para que te contacten en horario de atención. Gracias por escribir.', porAtender: true, motivo: 'admision' };
  }
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|menu|ayuda|informes?)\b/.test(t) || !t) return BIENVENIDA_FAMILIA(colegio);
  const g = await informeGeneral(env, colegio, t);
  if (g) return g;
  return { texto: 'Esa consulta no la tengo aprobada por el colegio y prefiero no inventar una respuesta. Escribe *5* para que secretaría te contacte.\n\n' + MENU, porAtender: false };
}

async function guardarLead(env, colegio, tel, nombre, grado) {
  const f = await env.DB.prepare(
    `INSERT INTO leads (colegio_id, nombre, telefono, grado, aviso_en) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(colegio_id, telefono) DO UPDATE SET nombre = excluded.nombre, grado = COALESCE(excluded.grado, leads.grado) RETURNING id`,
  ).bind(colegio.id, nombre, tel, grado).first();
  return f.id;
}
