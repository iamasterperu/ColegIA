// Chat privado del colegio: la misma inteligencia del agente de WhatsApp, pero dentro de la app
// instalable (sin WhatsApp, sin RUC, sin Meta). Cada persona entra con su cuenta y el agente la
// reconoce por su rol: dirección, profesores, secretaría, contabilidad o padres.
import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { normalizarTelefono } from '../lib/texto.js';
import { procesarEntrante } from '../whatsapp/agente.js';

const MAX_AUDIO = 700_000;
const MAX_ARCHIVO = 1_500_000;

function deBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// La "línea" de cada persona dentro del chat: su celular registrado; en colegios demo sin celular,
// una línea interna con el rol de su cuenta.
async function lineaDe(env, ctx, colegio) {
  const u = await env.DB.prepare(
    `SELECT u.id, u.rol, u.telefono, a.telefono AS tel_apoderado
       FROM usuarios u LEFT JOIN apoderados a ON a.id = u.apoderado_id AND a.colegio_id = u.colegio_id
      WHERE u.id = ? AND u.colegio_id = ? AND u.activo = 1`,
  ).bind(ctx.usuario.id, ctx.colegioId).first();
  if (!u) throw falla(401, 'Sesión no válida');
  const real = normalizarTelefono(u.rol === 'padre' ? u.tel_apoderado : u.telefono);
  if (real) return real;
  if (!colegio.es_demo) {
    throw falla(400, u.rol === 'padre'
      ? 'Tu celular aún no está registrado en el colegio. Pide a secretaría que lo agregue para activar tu chat.'
      : 'Tu cuenta no tiene celular registrado. Pide a dirección que lo agregue en «Usuarios y roles».');
  }
  const interna = `51988${String(u.id).padStart(6, '0')}`;
  const rol = ['direccion', 'contabilidad', 'secretaria', 'profesor', 'padre'].includes(u.rol) ? u.rol : 'direccion';
  await env.DB.prepare(
    `INSERT INTO wa_identidad_demo (colegio_id, telefono, rol) VALUES (?, ?, ?)
       ON CONFLICT (colegio_id, telefono) DO UPDATE SET rol = excluded.rol`,
  ).bind(colegio.id, interna, rol).run();
  return interna;
}

export function rutasChat(r) {
  r.get('/api/chat/historial', async (ctx, env) => {
    exigir(ctx);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const tel = await lineaDe(env, ctx, colegio);
    const despues = entero(ctx.url.searchParams.get('despues'), 0);
    const { results } = await env.DB.prepare(
      `SELECT id, sentido, tipo, texto, transcripcion, motivo, creado_en FROM mensajes
        WHERE colegio_id = ? AND telefono = ? AND id > ? ORDER BY id DESC LIMIT 80`,
    ).bind(ctx.colegioId, tel, despues).all();
    return json(results.reverse());
  });

  r.post('/api/chat', async (ctx, env) => {
    exigir(ctx);
    const d = await cuerpo(ctx.request, MAX_ARCHIVO * 1.4);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const telefono = await lineaDe(env, ctx, colegio);
    // Todo queda dentro de la app: los avisos a otras personas se guardan pero no salen a WhatsApp.
    const conexion = { colegio, modo: 'simulado', numerosPrueba: [] };
    let audio = null;
    let imagen = null;
    let documento = null;
    if (d.audio_b64) {
      const datos = deBase64(String(d.audio_b64));
      if (datos.length > MAX_AUDIO) throw falla(413, 'El audio es muy largo (máximo 1 minuto)');
      audio = { mime: String(d.mime || 'audio/webm').slice(0, 40), datos };
    } else if (d.archivo_b64) {
      const datos = deBase64(String(d.archivo_b64));
      if (datos.length > MAX_ARCHIVO) throw falla(413, 'El archivo pesa demasiado (máximo 1,5 MB)');
      const mime = String(d.mime || '').slice(0, 80);
      if (mime.startsWith('image/')) imagen = { mime, datos: datos.buffer };
      else documento = { mime, datos: datos.buffer, nombre: String(d.nombre || 'archivo').slice(0, 100) };
    } else if (!String(d.texto || '').trim()) {
      throw falla(400, 'Escribe un mensaje');
    }
    let transcripcion = audio ? String(d.transcripcion || '').slice(0, 2000) || null : null;
    if (audio && !transcripcion && env.AI) {
      try {
        const t = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: aBase64(audio.datos), language: 'es' });
        transcripcion = (t?.text || '').trim() || null;
      } catch { /* queda por atender */ }
    }
    await procesarEntrante(env, conexion, {
      telefono,
      tipo: audio ? 'audio' : imagen ? 'imagen' : documento ? 'documento' : 'texto',
      texto: audio ? null : String(d.texto || '').slice(0, 2000),
      transcripcion, audio, imagen, documento,
      origen: ctx.url.origin,
    });
    const { results } = await env.DB.prepare(
      `SELECT id, sentido, tipo, texto, transcripcion, motivo, creado_en FROM mensajes
        WHERE colegio_id = ? AND telefono = ? AND id > ? ORDER BY id`,
    ).bind(ctx.colegioId, telefono, entero(d.despues, 0)).all();
    return json({ mensajes: results });
  });
}
