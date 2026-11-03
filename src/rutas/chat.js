// Chat privado del colegio: la misma inteligencia del agente de WhatsApp, pero dentro de la app
// instalable (sin WhatsApp, sin RUC, sin Meta). Cada persona entra con su cuenta y el agente la
// reconoce por su rol: dirección, profesores, secretaría, contabilidad o padres.
import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { procesarEntrante } from '../whatsapp/agente.js';
import { lineaInterna } from '../lib/buzon.js';

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

// La "línea" de cada persona dentro del chat: una línea interna propia de su cuenta. Así el chat
// funciona sin celular registrado ni WhatsApp: la identidad es la sesión iniciada en la app.
async function lineaDe(env, ctx, colegio) {
  const u = await env.DB.prepare(
    `SELECT u.id, u.nombre, u.rol, u.apoderado_id, ap.nombres, ap.apellidos
       FROM usuarios u LEFT JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = u.colegio_id
      WHERE u.id = ? AND u.colegio_id = ? AND u.activo = 1`,
  ).bind(ctx.usuario.id, ctx.colegioId).first();
  if (!u) throw falla(401, 'Sesión no válida');
  const telefono = lineaInterna(u.id);
  let persona;
  if (u.rol === 'padre') {
    if (!u.apoderado_id) throw falla(400, 'Tu cuenta aún no está vinculada a un apoderado. Pide a secretaría que lo vincule.');
    persona = {
      rol: 'padre', nombre: String(u.nombres).split(' ')[0], telefono,
      apoderado: { id: u.apoderado_id, nombres: u.nombres, apellidos: u.apellidos },
      usuario: { id: null, colegio_id: colegio.id, nombre: `${u.nombres} ${u.apellidos}`, rol: 'padre', apoderado_id: u.apoderado_id },
    };
  } else {
    persona = {
      rol: u.rol, nombre: u.nombre.split(' ')[0], telefono,
      usuario: { id: u.id, colegio_id: colegio.id, nombre: u.nombre, rol: u.rol, apoderado_id: null },
    };
  }
  return { telefono, persona };
}

const marcarLeido = (env, ctx, tel) => env.DB.prepare(
  'UPDATE usuarios SET chat_leido_id = COALESCE((SELECT MAX(id) FROM mensajes WHERE colegio_id = ? AND telefono = ?), chat_leido_id) WHERE id = ?',
).bind(ctx.colegioId, tel, ctx.usuario.id).run();

export function rutasChat(r) {
  // Contador de "sin leer" (como en WhatsApp): avisos y recordatorios que llegaron al chat
  r.get('/api/chat/no-leidos', async (ctx, env) => {
    exigir(ctx);
    const f = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM mensajes m JOIN usuarios u ON u.id = ? WHERE m.colegio_id = ? AND m.telefono = ? AND m.sentido = 'saliente' AND m.id > u.chat_leido_id`,
    ).bind(ctx.usuario.id, ctx.colegioId, lineaInterna(ctx.usuario.id)).first();
    return json({ n: f?.n || 0 });
  });

  r.get('/api/chat/historial', async (ctx, env) => {
    exigir(ctx);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const { telefono: tel } = await lineaDe(env, ctx, colegio);
    const despues = entero(ctx.url.searchParams.get('despues'), 0);
    const { results } = await env.DB.prepare(
      `SELECT id, sentido, tipo, texto, transcripcion, motivo, creado_en FROM mensajes
        WHERE colegio_id = ? AND telefono = ? AND id > ? ORDER BY id DESC LIMIT 80`,
    ).bind(ctx.colegioId, tel, despues).all();
    await marcarLeido(env, ctx, tel);
    return json(results.reverse());
  });

  r.post('/api/chat', async (ctx, env) => {
    exigir(ctx);
    const d = await cuerpo(ctx.request, MAX_ARCHIVO * 1.4);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const { telefono, persona } = await lineaDe(env, ctx, colegio);
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
      telefono, persona,
      tipo: audio ? 'audio' : imagen ? 'imagen' : documento ? 'documento' : 'texto',
      texto: audio ? null : String(d.texto || '').slice(0, 2000),
      transcripcion, audio, imagen, documento,
      origen: ctx.url.origin,
    });
    const { results } = await env.DB.prepare(
      `SELECT id, sentido, tipo, texto, transcripcion, motivo, creado_en FROM mensajes
        WHERE colegio_id = ? AND telefono = ? AND id > ? ORDER BY id`,
    ).bind(ctx.colegioId, telefono, entero(d.despues, 0)).all();
    await marcarLeido(env, ctx, telefono);
    return json({ mensajes: results });
  });
}
