// Textos de consentimiento (Ley 29733, art. 13 y 14). Si cambias un texto, sube su
// versión: los consentimientos guardados quedan ligados a la versión que el padre aceptó.
export const FINALIDADES = {
  whatsapp: {
    version: 'wa-2026-1',
    titulo: 'Comunicaciones por WhatsApp',
    texto:
      'Autorizo a {colegio} a usar mi número de celular para enviarme por WhatsApp recordatorios de pago, ' +
      'avisos, listas de útiles e información académica de mi hijo(a), y a responder mis consultas por ese medio. ' +
      'WhatsApp es un servicio de Meta Platforms, con servidores fuera del Perú (flujo transfronterizo). ' +
      'Puedo retirar esta autorización en cualquier momento escribiendo BAJA o desde el portal.',
  },
  salud: {
    version: 'salud-2026-1',
    titulo: 'Datos de salud (datos sensibles)',
    texto:
      'Autorizo expresamente a {colegio} a registrar y tratar los datos de salud de mi hijo(a) (alergias, ' +
      'condiciones médicas, seguro y contacto de emergencia) solo para su cuidado dentro del colegio. ' +
      'Solo los verá el personal autorizado y el docente de aula verá únicamente las alertas necesarias.',
  },
  tutor_ia: {
    version: 'tutor-2026-1',
    titulo: 'Tutor de IA para mi hijo(a)',
    texto:
      'Autorizo a {colegio} a que mi hijo(a) use el tutor de inteligencia artificial por WhatsApp desde el celular que ' +
      'registro. El tutor guía con preguntas y no entrega respuestas; su profesor verá en qué temas pidió ayuda. ' +
      'El servicio usa Cloudflare Workers AI (servidores fuera del Perú). Puedo retirar esta autorización cuando quiera.',
  },
  imagen: {
    version: 'imagen-2026-1',
    titulo: 'Uso de imagen',
    texto:
      'Autorizo a {colegio} a tomar y publicar fotos o videos de mi hijo(a) en actividades escolares, ' +
      'en medios internos y redes oficiales del colegio.',
  },
};

export const textoFinalidad = (finalidad, colegio) =>
  FINALIDADES[finalidad].texto.replaceAll('{colegio}', colegio);

// ¿El apoderado autorizó esta finalidad para este alumno? (último registro vigente)
export async function consentido(env, apoderadoId, alumnoId, finalidad) {
  const fila = await env.DB.prepare(
    `SELECT otorgado FROM consentimientos WHERE apoderado_id = ? AND alumno_id = ? AND finalidad = ?
      ORDER BY id DESC LIMIT 1`,
  ).bind(apoderadoId, alumnoId, finalidad).first();
  return fila?.otorgado === 1;
}

// ¿Algún apoderado del alumno autorizó esta finalidad?
export async function consentidoAlumno(env, alumnoId, finalidad) {
  const fila = await env.DB.prepare(
    `SELECT 1 FROM consentimiento_vigente WHERE alumno_id = ? AND finalidad = ? AND otorgado = 1 LIMIT 1`,
  ).bind(alumnoId, finalidad).first();
  return !!fila;
}
