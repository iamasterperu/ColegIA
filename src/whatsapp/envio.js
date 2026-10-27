// Envío de WhatsApp: modo simulado (queda en el chat de prueba) o WhatsApp Cloud API.
import { descifrar } from '../lib/cripto.js';

export const versionGraph = (env) => env.WA_GRAPH_VERSION || 'v23.0';

export async function cargarConexion(env, colegio) {
  const conexion = { colegio, modo: 'simulado', token: null };
  if (colegio.wa_modo === 'cloud' && colegio.wa_phone_number_id && colegio.wa_token_cifrado) {
    conexion.token = await descifrar(env, colegio.wa_token_cifrado);
    if (conexion.token) conexion.modo = 'cloud';
  }
  conexion.numerosPrueba = String(colegio.wa_numeros_prueba || '').split(/[\s,;]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean);
  return conexion;
}

async function llamarGraph(env, conexion, ruta, cuerpo) {
  const resp = await fetch(`https://graph.facebook.com/${versionGraph(env)}/${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${conexion.token}`, 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos?.error?.message || `Error ${resp.status} de WhatsApp`);
  return datos;
}

export const probarConexion = (env, conexion) =>
  llamarGraph(env, conexion, `${conexion.colegio.wa_phone_number_id}?fields=display_phone_number,verified_name,quality_rating`);

export async function descargarMedia(env, conexion, mediaId) {
  const meta = await llamarGraph(env, conexion, mediaId);
  if (meta.file_size > 1_500_000) throw new Error('Archivo demasiado grande');
  const resp = await fetch(meta.url, { headers: { authorization: `Bearer ${conexion.token}` } });
  if (!resp.ok) throw new Error('No se pudo descargar el audio');
  return { mime: meta.mime_type || 'audio/ogg', datos: await resp.arrayBuffer() };
}

/**
 * Envía (o simula) un mensaje y lo guarda en `mensajes`.
 * mensaje: { telefono, apoderadoId, usuarioId, texto, motivo, plantilla?: { nombre, parametros[] }, enviadoPor, respuesta,
 *            documento?: { url, nombre } }  — un documento se envía como PDF adjunto con el texto de pie
 * Si hay plantilla y el canal es Cloud API se envía la plantilla aprobada (obligatorio fuera de
 * la ventana de 24 h); en simulado se guarda el texto ya armado.
 */
export async function enviar(env, conexion, mensaje) {
  const c = conexion.colegio;
  let canal = conexion.modo;
  // Con números de prueba, los envíos que inicia el colegio solo salen a esos números.
  // Las respuestas a quien acaba de escribir siempre salen: esa persona existe y está esperando.
  if (canal === 'cloud' && !mensaje.respuesta && conexion.numerosPrueba.length && !conexion.numerosPrueba.includes(mensaje.telefono)) {
    canal = 'simulado';
  }
  let waId = null;
  let estado = 'ok';
  let error = null;
  let tipo = 'texto';
  if (canal === 'cloud') {
    try {
      let carga;
      if (mensaje.plantilla?.nombre) {
        tipo = 'plantilla';
        carga = {
          messaging_product: 'whatsapp', to: mensaje.telefono, type: 'template',
          template: {
            name: mensaje.plantilla.nombre, language: { code: c.wa_plantilla_idioma || 'es' },
            components: [{ type: 'body', parameters: mensaje.plantilla.parametros.map((t) => ({ type: 'text', text: String(t) })) }],
          },
        };
      } else if (mensaje.documento) {
        carga = {
          messaging_product: 'whatsapp', to: mensaje.telefono, type: 'document',
          document: { link: mensaje.documento.url, filename: mensaje.documento.nombre, caption: mensaje.texto.slice(0, 1000) },
        };
      } else {
        carga = { messaging_product: 'whatsapp', to: mensaje.telefono, type: 'text', text: { body: mensaje.texto, preview_url: false } };
      }
      const r = await llamarGraph(env, conexion, `${c.wa_phone_number_id}/messages`, carga);
      waId = r.messages?.[0]?.id || null;
    } catch (e) {
      estado = 'error';
      error = String(e.message || e).slice(0, 300);
    }
  }
  const fila = await env.DB.prepare(
    `INSERT INTO mensajes (colegio_id, telefono, apoderado_id, usuario_id, sentido, tipo, texto, canal, motivo, estado, error, wa_message_id, enviado_por)
     VALUES (?, ?, ?, ?, 'saliente', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(c.id, mensaje.telefono, mensaje.apoderadoId ?? null, mensaje.usuarioId ?? null, tipo,
    mensaje.documento ? `📄 ${mensaje.documento.nombre}\n${mensaje.documento.url}\n${mensaje.texto}` : mensaje.texto, canal, mensaje.motivo || 'manual',
    estado, error, waId, mensaje.enviadoPor ?? null).first();
  return { id: fila.id, canal, estado, error };
}
