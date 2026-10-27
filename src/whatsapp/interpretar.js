// Interpreta lo que escribe cada rol. Primero reglas (rápidas y gratis); si no se
// entiende y hay Workers AI, un modelo pequeño elige la intención. La IA solo
// clasifica: los datos de las respuestas siempre salen de la base, nunca del modelo.
import { normalizar } from '../lib/texto.js';

// [intención, expresión, descripción para el modelo]
export const INTENCIONES = {
  padre: [
    ['como_pagar', /\b(como (pago|pagar|puedo pagar)|donde (pago|pagar)|numero de cuenta|cuenta bancaria|yape|plin|transferencia|deposito)\b/, 'pregunta cómo o dónde pagar'],
    ['justificar', /\b(justific\w*|no (va a ir|ira|asistira|fue)|estara enfermo|esta enfermo|cita medica|permiso)\b/, 'avisa o justifica una inasistencia de su hijo'],
    ['deuda', /\b(deuda|deudas|debo|pago|pagos|pension|pensiones|cuota|cuotas|saldo|mensualidad)\b/, 'pregunta cuánto debe o sus pagos'],
    ['utiles', /\b(util|utiles|lista|materiales)\b/, 'pide la lista de útiles'],
    ['como_va', /\bcomo (le |les )?(fue|va|esta yendo|anda|esta en)\b/, 'pregunta cómo le va a su hijo en un curso o en el colegio'],
    ['notas', /\b(nota|notas|calificacion|calificaciones|libreta|bimestre)\b/, 'pregunta por notas'],
    ['asistencia', /\b(asistencia|faltas|falto|tardanza|tardanzas)\b/, 'pregunta por asistencia o faltas'],
    ['tutor', /\b(tutor|tutor ia|tutoria virtual)\b/, 'quiere activar o saber del tutor de IA para su hijo'],
    ['mis_datos', /\b(mis datos|que datos|datos personales|proteccion de datos|autorizacion|autorizaciones|arco)\b/, 'pregunta por sus datos personales o autorizaciones'],
    ['humano', /\b(secretaria|persona|humano|asesor|hablar|reclamo|queja|cita)\b/, 'quiere hablar con una persona'],
  ],
  profesor: [
    ['notas_registrar', /^(registrar |subir |cargar |poner )?notas? .* (ad|a|b|c|\d{1,2})$/, 'registrar notas de varios alumnos'],
    ['asistencia_aula', /^(asistencia|pase de lista|lista de hoy|faltaron|ausentes)\b/, 'registrar la asistencia de hoy de varios alumnos'],
    ['examen', /\b(examen|examenes|evaluacion|prueba|practica calificada|preguntas de)\b/, 'crear un examen con preguntas, versiones A/B y solucionario'],
    ['sesion', /\b(sesion|planific\w*|plan de clase|clase sobre|clase de)\b/, 'planificar una sesión de clase'],
    ['adaptar', /\b(adapta\w*|tdah|dislexia|autismo|tea|nee|necesidades especiales|inclusion)\b/, 'adaptar material para un alumno con necesidades especiales'],
    ['traducir', /^(traduc\w*)\b/, 'traducir un texto o comunicado'],
    ['resultados', /^(resultados?|calificar|corregir|fallaron|notas del examen)\b/, 'registrar qué preguntas falló cada alumno en un examen'],
    ['radar', /\b(radar|temas debiles|que temas)\b/, 'ver el radar de temas débiles del aula'],
    ['tutor', /\b(tutor|se trabaron|dudas de mis alumnos)\b/, 'ver en qué temas se trabaron sus alumnos con el tutor IA'],
    ['riesgo', /\b(riesgo|en riesgo|alerta temprana|desaprob\w*)\b/, 'ver alumnos en riesgo'],
    ['faltantes', /\b(faltantes|utiles que faltan|lo que falta)\b/, 'avisar a cada padre los útiles que le faltan'],
    ['utiles', /^(utiles|entrego|entregaron|lista de utiles)\b/, 'marcar los útiles entregados por un alumno'],
    ['falta', /^(falta|faltas|tardanza|tarde|llego tarde|no vino|inasistencia)\b/, 'registrar una falta o tardanza de un alumno'],
    ['avisar', /^(avisar|aviso|avisa|comunicar|comunicado|recordar a los padres)\b/, 'enviar un aviso a los padres de su sección'],
    ['alertas', /\b(alerta|alertas|alergia|alergias|salud)\b/, 'ver alertas de salud de su aula'],
    ['justificaciones', /\b(justificacion|justificaciones|justificaron|avisos de padres)\b/, 'ver justificaciones enviadas por los padres'],
    ['secciones', /\b(mis secciones|mis alumnos|mi aula|mis aulas|lista de alumnos)\b/, 'ver sus secciones y alumnos'],
    ['alumno', /^(alumno|alumna|ficha|ver|buscar|notas de|como va)\b|\bcomo (le )?va\b/, 'ver el resumen de un alumno por su nombre'],
  ],
  contabilidad: [
    ['voucher_accion', /^(confirmar|rechazar) (voucher )?\d+/, 'confirmar o rechazar un voucher'],
    ['vouchers', /\b(voucher|vouchers|comprobantes|reportados|yapeos)\b/, 'ver vouchers enviados por los padres'],
    ['pagar', /^(pago|pagar|pago de|registrar pago|registra pago|cobre|cobrado|pago recibido)\b/, 'registrar el pago de un alumno'],
    ['recordatorios', /\b(recordatorio|recordatorios|cobrar a todos|enviar cobranza)\b/, 'enviar recordatorios de pago a los morosos'],
    ['morosos', /\b(moroso|morosos|morosidad|quienes deben|nos deben|deben mas|deudores|mas deben)\b/, 'ver la lista de morosos'],
    ['resumen', /\b(resumen|cobranza|cuanto cobramos|recaudado|caja)\b/, 'ver el resumen de cobranza'],
    ['deuda_alumno', /^(deuda|debe|cuanto debe|estado de cuenta|saldo)\b/, 'ver la deuda de un alumno por su nombre'],
  ],
  secretaria: [
    ['traducir', /^(traduc\w*)\b/, 'traducir un comunicado'],
    ['faltantes', /\b(faltantes|utiles que faltan|lo que falta)\b/, 'avisar a cada padre los útiles que le faltan'],
    ['avisar', /^(avisar|aviso|avisa|comunicar|comunicado)\b/, 'enviar un aviso a los padres de un grado'],
    ['por_atender', /\b(por atender|pendientes|mensajes|bandeja|quien escribio)\b/, 'ver mensajes de padres por atender'],
    ['utiles', /\b(util|utiles|lista)\b/, 'ver la lista de útiles de un grado'],
    ['autorizaciones', /\b(autorizacion|autorizaciones|consentimiento|consentimientos)\b/, 'ver autorizaciones pendientes'],
    ['alumno', /^(alumno|alumna|ficha|buscar|contacto|telefono de|apoderado de)\b/, 'buscar un alumno y sus contactos'],
  ],
  direccion: [
    ['deuda_aula', /\b(cuanto deben|deben en|deuda de|deuda del|deuda en)\b.*\d/, 'ver la deuda de un aula (por ejemplo 3ro B)'],
    ['lectura', /\b(leyeron|leido|lectura|confirmaron|quien leyo)\b/, 'ver quién leyó el último comunicado'],
    ['riesgo', /\b(riesgo|en riesgo|alerta temprana|desaprob\w*)\b/, 'ver alumnos y aulas en riesgo'],
    ['traducir', /^(traduc\w*)\b/, 'traducir un comunicado'],
    ['comunicado', /^(comunicado|comunicar|avisar|aviso|enviar a todos)\b/, 'enviar un comunicado a todos los padres'],
    ['deuda_grados', /\b(deuda por grado|grados|por grado|por aula)\b/, 'ver la deuda vencida por grado'],
    ['accesos', /\b(accesos|quien vio|registro|auditoria|ley 29733)\b/, 'ver quién consultó datos hoy'],
    ['arco', /\b(arco|solicitudes|derechos)\b/, 'ver solicitudes ARCO pendientes'],
    ['resumen', /\b(resumen|como vamos|indicadores|panel|reporte|cobranza|morosidad|matricula)\b/, 'ver el resumen del colegio'],
    ['alumno', /^(alumno|alumna|ficha|ver|buscar|como va)\b/, 'ver el resumen de un alumno por su nombre'],
  ],
};

// Opciones numéricas de cada menú
export const OPCIONES = {
  padre: ['deuda', 'como_pagar', 'utiles', 'notas', 'asistencia', 'justificar', 'humano', 'mis_datos', 'tutor'],
  profesor: ['examen', 'sesion', 'alumno', 'asistencia_aula', 'resultados', 'radar', 'riesgo', 'utiles', 'avisar'],
  contabilidad: ['resumen', 'morosos', 'deuda_alumno', 'pagar', 'recordatorios', 'vouchers'],
  secretaria: ['alumno', 'por_atender', 'utiles', 'autorizaciones', 'avisar', 'faltantes'],
  direccion: ['resumen', 'deuda_grados', 'deuda_aula', 'riesgo', 'comunicado', 'lectura', 'accesos', 'arco'],
  alumno: [],
};
INTENCIONES.alumno = [];

// Antes de las intenciones del rol: respuestas exactas
const EXACTAS = [
  ['si', /^(si|confirmo|confirmar|dale|ok si|correcto|de acuerdo)$/],
  ['no', /^(no|cancelar|cancela|anular)$/],
  ['acepto', /^(acepto|si acepto|autorizo|si autorizo)$/],
  ['baja', /^(baja|stop|no deseo|desuscribir)\b/],
];
// Después: saludos y cortesía ("hola, ¿cuánto debo?" ya se resolvió como deuda)
const CORTESIA = [
  ['menu', /^(hola|buenas|buenos|menu|inicio|ayuda|opciones|que puedes hacer|0)\b/],
  ['gracias', /^(gracias|listo|perfecto|genial|muchas gracias|ok)\b/],
];

// Palabras que se quitan para quedarse con "lo demás" (nombre del alumno, texto del aviso…)
const RELLENO = /^(por favor|porfa|quiero|necesito|me puedes|puedes|podrias|dame|ver|registrar|registra|el|la|de|del|al|a|alumno|alumna|ficha|buscar|falta|tardanza|pago|pagar|deuda|debe|cuanto debe|avisar|aviso|comunicado|comunicar|mensaje|contacto|apoderado de|telefono de|notas de|como va)(?=[\s:,.]|$)[\s:,.]*/;
// Quita tildes letra por letra sin cambiar el largo del texto
const sinTildes = (s) => [...s].map((c) => c.normalize('NFD')[0]).join('').toLowerCase();

export function resto(texto) {
  let t = String(texto || '').normalize('NFC').trim();
  for (let m = RELLENO.exec(sinTildes(t)); m && m[0]; m = RELLENO.exec(sinTildes(t))) t = t.slice(m[0].length);
  return t.trim();
}

// Para avisos y justificaciones el mensaje se conserva entero: solo se quita la palabra clave
const MENSAJE_LIBRE = /^\s*(?:avisar|aviso|avisa|comunicar|comunicado|enviar a todos|traduc\w*|resultados?)\b[\s:,.-]*/i;
const CON_MENSAJE = new Set(['avisar', 'comunicado', 'justificar', 'examen', 'sesion', 'adaptar', 'traducir', 'resultados']);

export function porReglas(rol, texto) {
  const t = normalizar(texto);
  if (!t) return { intencion: 'vacio' };
  const opciones = OPCIONES[rol];
  if (/^\d$/.test(t) && opciones?.[Number(t) - 1]) return { intencion: opciones[Number(t) - 1], consulta: '' };
  for (const [k, re] of EXACTAS) if (re.test(t)) return { intencion: k };
  // "notas Matemática: Mateo 15; Ana AD" — los dos puntos se pierden al normalizar
  if (rol !== 'padre' && rol !== 'alumno' && /^\s*(registrar |subir |cargar |poner )?notas?\b[^:]*:/i.test(texto)) return { intencion: 'notas_registrar', consulta: texto };
  for (const [k, re] of INTENCIONES[rol]) {
    if (!re.test(t)) continue;
    return { intencion: k, consulta: CON_MENSAJE.has(k) ? String(texto).replace(MENSAJE_LIBRE, '').trim() : resto(texto) };
  }
  for (const [k, re] of CORTESIA) if (re.test(t)) return { intencion: k };
  return { intencion: 'desconocido', consulta: texto };
}

const MODELO = '@cf/meta/llama-3.1-8b-instruct-fast';

export async function interpretar(env, rol, texto) {
  const r = porReglas(rol, texto);
  if (r.intencion !== 'desconocido' || !env.AI) return r;
  try {
    const lista = INTENCIONES[rol].map(([k, , d]) => `- ${k}: ${d}`).join('\n');
    const salida = await env.AI.run(MODELO, {
      messages: [
        { role: 'system', content: `Clasificas mensajes de WhatsApp que un ${rol} envía al asistente de un colegio peruano. Responde solo JSON {"intencion": "...", "consulta": "..."}. "intencion" es una de:\n${lista}\n- menu: saluda o pide ayuda\n- desconocido: nada de lo anterior\n"consulta" es el dato útil del mensaje (nombre del alumno, grado o texto del aviso), o "".` },
        { role: 'user', content: String(texto).slice(0, 400) },
      ],
      max_tokens: 80,
      temperature: 0,
    });
    const json = JSON.parse(String(salida?.response ?? '').match(/\{[\s\S]*\}/)?.[0] || '{}');
    const validas = [...INTENCIONES[rol].map(([k]) => k), 'menu'];
    if (validas.includes(json.intencion)) return { intencion: json.intencion, consulta: String(json.consulta || ''), ia: true };
  } catch { /* sin IA: se queda en desconocido */ }
  return r;
}
