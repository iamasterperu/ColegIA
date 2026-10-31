import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar } from '../lib/auditoria.js';
import { normalizarTelefono } from '../lib/texto.js';
import { descifrar, hmacSha256, igualSeguro } from '../lib/cripto.js';
import { cargarConexion, descargarMedia, enviar } from '../whatsapp/envio.js';
import { procesarEntrante, bienvenida } from '../whatsapp/agente.js';
import { identificar, encolar, procesarCola } from '../whatsapp/comun.js';

const MAX_AUDIO = 700_000; // ~1 minuto de nota de voz
const MAX_ARCHIVO = 1_500_000; // fotos y Excel

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

// Workers AI (opcional): transcribe audios reales de WhatsApp.
async function transcribir(env, audio) {
  if (!env.AI) return null;
  try {
    const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: aBase64(audio.datos), language: 'es' });
    return (r?.text || '').trim() || null;
  } catch {
    return null;
  }
}

export function rutasWhatsapp(r) {
  r.get('/api/whatsapp/contactos', async (ctx, env) => {
    exigir(ctx, 'whatsapp.ver');
    const { results } = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.apellidos, ap.telefono,
              GROUP_CONCAT(a.nombres || ' (' || a.grado || ' ' || a.seccion || ')', ', ') AS hijos,
              (SELECT COUNT(*) FROM consentimiento_vigente cv WHERE cv.apoderado_id = ap.id AND cv.finalidad = 'whatsapp' AND cv.otorgado = 1) AS consiente
         FROM apoderados ap JOIN alumno_apoderado aa ON aa.apoderado_id = ap.id JOIN alumnos a ON a.id = aa.alumno_id
        WHERE ap.colegio_id = ? AND ap.telefono IS NOT NULL GROUP BY ap.id ORDER BY ap.apellidos LIMIT 400`,
    ).bind(ctx.colegioId).all();
    const { results: personal } = await env.DB.prepare(
      `SELECT id, nombre, rol, telefono FROM usuarios WHERE colegio_id = ? AND telefono IS NOT NULL AND activo = 1 AND rol != 'padre' ORDER BY rol, nombre`,
    ).bind(ctx.colegioId).all();
    ctx.waitUntil(auditar(env, ctx, 'ver_contactos_whatsapp'));
    return json({ apoderados: results, personal });
  });

  r.get('/api/whatsapp/conversaciones', async (ctx, env) => {
    exigir(ctx, 'whatsapp.ver');
    const { results } = await env.DB.prepare(
      `SELECT m.telefono, m.id, m.texto, m.tipo, m.sentido, m.canal, m.creado_en,
              COALESCE(ap.nombres, u.nombre) AS nombres, COALESCE(ap.apellidos, '') AS apellidos, u.rol AS rol_personal,
              (SELECT COUNT(*) FROM mensajes x WHERE x.colegio_id = m.colegio_id AND x.telefono = m.telefono AND x.estado = 'por_atender') AS por_atender
         FROM mensajes m LEFT JOIN apoderados ap ON ap.colegio_id = m.colegio_id AND ap.telefono = m.telefono
         LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.id IN (SELECT MAX(id) FROM mensajes WHERE colegio_id = ? GROUP BY telefono)
        ORDER BY m.id DESC LIMIT 60`,
    ).bind(ctx.colegioId).all();
    return json(results);
  });

  r.get('/api/whatsapp/conversacion', async (ctx, env) => {
    exigir(ctx, 'whatsapp.ver');
    const tel = normalizarTelefono(ctx.url.searchParams.get('telefono'));
    if (!tel) throw falla(400, 'Teléfono inválido');
    const despues = entero(ctx.url.searchParams.get('despues'), 0);
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.sentido, m.tipo, m.texto, m.transcripcion, m.canal, m.motivo, m.estado, m.error, m.creado_en,
              EXISTS (SELECT 1 FROM mensajes_audio au WHERE au.mensaje_id = m.id) AS tiene_audio
         FROM mensajes m WHERE m.colegio_id = ? AND m.telefono = ? AND m.id > ? ORDER BY m.id DESC LIMIT 100`,
    ).bind(ctx.colegioId, tel, despues).all();
    if (!despues) ctx.waitUntil(auditar(env, ctx, 'ver_conversacion', 'telefono', null, { telefono: tel }));
    return json(results.reverse());
  });

  r.get('/api/whatsapp/audio/:id', async (ctx, env) => {
    exigir(ctx, 'whatsapp.ver');
    const fila = await env.DB.prepare(
      `SELECT au.mime, au.datos FROM mensajes_audio au JOIN mensajes m ON m.id = au.mensaje_id
        WHERE au.mensaje_id = ? AND m.colegio_id = ?`,
    ).bind(entero(ctx.params.id), ctx.colegioId).first();
    if (!fila) throw falla(404, 'Audio no encontrado');
    ctx.waitUntil(auditar(env, ctx, 'escuchar_audio', 'mensaje', entero(ctx.params.id)));
    return new Response(new Uint8Array(fila.datos), { headers: { 'content-type': fila.mime, 'cache-control': 'private, no-store' } });
  });

  // Chat de prueba: escribe como si fueras el apoderado. Siempre en modo simulado,
  // aunque el colegio ya tenga Cloud API conectada, para no enviar nada real.
  r.post('/api/whatsapp/simulador', async (ctx, env) => {
    exigir(ctx, 'whatsapp.ver');
    const d = await cuerpo(ctx.request, MAX_ARCHIVO * 1.4);
    const telefono = normalizarTelefono(d.telefono);
    if (!telefono) throw falla(400, 'Elige un número válido');
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
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
    const respuestas = await procesarEntrante(env, conexion, {
      telefono,
      tipo: audio ? 'audio' : imagen ? 'imagen' : documento ? 'documento' : 'texto',
      texto: audio ? null : String(d.texto || '').slice(0, 2000),
      transcripcion: audio ? String(d.transcripcion || '').slice(0, 2000) || null : null,
      audio, imagen, documento,
      origen: ctx.url.origin,
    });
    return json({ respuestas });
  });

  // Bienvenida: el agente se presenta con el menú del rol. A una persona del personal
  // (usuario_id) o, por tandas, a todos los apoderados con celular.
  r.post('/api/whatsapp/bienvenida', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const d = await cuerpo(ctx.request, 2000);
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const conexion = await cargarConexion(env, colegio);
    if (d.usuario_id) {
      const u = await env.DB.prepare("SELECT telefono FROM usuarios WHERE id = ? AND colegio_id = ? AND rol != 'padre'").bind(entero(d.usuario_id), ctx.colegioId).first();
      if (!u?.telefono) throw falla(400, 'Ese usuario no tiene celular registrado');
      const persona = await identificar(env, colegio, u.telefono);
      const res = await bienvenida(env, conexion, persona);
      await auditar(env, ctx, 'enviar_bienvenida', 'usuario', entero(d.usuario_id), { canal: res.canal });
      return json(res);
    }
    const { results } = await env.DB.prepare(
      `SELECT ap.id AS apoderado_id, ap.nombres, ap.telefono FROM apoderados ap
        WHERE ap.colegio_id = ? AND ap.telefono IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM mensajes m WHERE m.colegio_id = ap.colegio_id AND m.apoderado_id = ap.id AND m.motivo = 'bienvenida')
          AND NOT EXISTS (SELECT 1 FROM wa_cola q WHERE q.colegio_id = ap.colegio_id AND q.apoderado_id = ap.id AND q.motivo = 'bienvenida')`,
    ).bind(ctx.colegioId).all();
    const n = await encolar(env, colegio, results,
      `soy el nuevo asistente de WhatsApp de ${colegio.nombre} 🤖. Por aquí puedes consultar pagos, notas, asistencia y útiles de tu hijo(a), y justificar faltas. Escribe *HOLA* para empezar.`,
      'bienvenida', ctx.usuario.id);
    await auditar(env, ctx, 'enviar_bienvenida', null, null, { apoderados: n });
    const enviados = await procesarCola(env, 30, cargarConexion); // primera tanda; el resto lo envía el cron
    return json({ encolados: n, enviados });
  });

  // Respuesta manual del personal (usa el canal real si está configurado).
  r.post('/api/whatsapp/responder', async (ctx, env) => {
    exigir(ctx, 'whatsapp.responder');
    const d = await cuerpo(ctx.request, 10_000);
    const telefono = normalizarTelefono(d.telefono);
    const texto = String(d.texto || '').trim().slice(0, 2000);
    if (!telefono || !texto) throw falla(400, 'Falta el número o el mensaje');
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const ap = await env.DB.prepare('SELECT id FROM apoderados WHERE colegio_id = ? AND telefono = ?').bind(ctx.colegioId, telefono).first();
    const res = await enviar(env, await cargarConexion(env, colegio), {
      telefono, apoderadoId: ap?.id, texto, motivo: 'manual', enviadoPor: ctx.usuario.id,
    });
    await env.DB.batch([
      env.DB.prepare("UPDATE mensajes SET estado = 'ok' WHERE colegio_id = ? AND telefono = ? AND estado = 'por_atender'").bind(ctx.colegioId, telefono),
    ]);
    await auditar(env, ctx, 'responder_whatsapp', 'apoderado', ap?.id ?? null, { canal: res.canal, estado: res.estado });
    return json(res);
  });
}

// ---- Webhook de WhatsApp Cloud API ----
export function rutasWebhook(r) {
  // Verificación que hace Meta al registrar el webhook
  r.get('/webhook/whatsapp/:slug', async (ctx, env) => {
    const p = ctx.url.searchParams;
    const c = await env.DB.prepare('SELECT wa_verify_token FROM colegios WHERE slug = ?').bind(ctx.params.slug).first();
    if (c?.wa_verify_token && p.get('hub.mode') === 'subscribe' && igualSeguro(p.get('hub.verify_token') || '', c.wa_verify_token)) {
      return new Response(p.get('hub.challenge') || '', { status: 200 });
    }
    return new Response('Token de verificación incorrecto', { status: 403 });
  });

  r.post('/webhook/whatsapp/:slug', async (ctx, env) => {
    const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE slug = ?').bind(ctx.params.slug).first();
    if (!colegio) return new Response('No encontrado', { status: 404 });
    const crudo = await ctx.request.arrayBuffer();
    if (crudo.byteLength > 1_000_000) return new Response('Muy grande', { status: 413 });
    // Firma X-Hub-Signature-256: confirma que el mensaje viene de Meta
    const secreto = await descifrar(env, colegio.wa_app_secret_cifrado);
    const firma = ctx.request.headers.get('x-hub-signature-256') || '';
    if (!secreto || !igualSeguro(firma, 'sha256=' + (await hmacSha256(secreto, crudo)))) {
      return new Response('Firma inválida', { status: 401 });
    }
    let datos;
    try { datos = JSON.parse(new TextDecoder().decode(crudo)); } catch { return new Response('JSON inválido', { status: 400 }); }

    ctx.waitUntil(procesarWebhook(env, colegio, datos, ctx.url.origin).catch((e) => console.error('webhook', e)));
    return new Response('ok', { status: 200 }); // Meta exige respuesta rápida
  });
}

async function procesarWebhook(env, colegio, datos, origen) {
  const conexion = await cargarConexion(env, colegio);
  for (const entrada of datos.entry || []) {
    for (const cambio of entrada.changes || []) {
      const v = cambio.value || {};
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== colegio.wa_phone_number_id) continue;
      for (const st of v.statuses || []) {
        if (st.status === 'failed') {
          await env.DB.prepare("UPDATE mensajes SET estado = 'error', entrega = 'failed', error = ? WHERE wa_message_id = ? AND colegio_id = ?")
            .bind(String(st.errors?.[0]?.title || 'Falló la entrega').slice(0, 300), st.id, colegio.id).run();
        } else if (['sent', 'delivered', 'read'].includes(st.status)) {
          // Confirmación de lectura: "read" no se pisa con un "delivered" que llegue tarde
          await env.DB.prepare("UPDATE mensajes SET entrega = ? WHERE wa_message_id = ? AND colegio_id = ? AND COALESCE(entrega, '') != 'read'")
            .bind(st.status, st.id, colegio.id).run();
        }
      }
      for (const m of (v.messages || []).slice(0, 5)) {
        const base = { telefono: m.from, waId: m.id, origen, ts: Number(m.timestamp) || null };
        if (m.type === 'audio' && conexion.modo === 'cloud') {
          let audio = null;
          try { audio = await descargarMedia(env, conexion, m.audio.id); } catch { /* se atiende como audio sin archivo */ }
          await procesarEntrante(env, conexion, {
            ...base, tipo: 'audio', audio, transcripcion: audio ? await transcribir(env, audio) : null,
          });
        } else if ((m.type === 'image' || m.type === 'document') && conexion.modo === 'cloud') {
          const media = m.type === 'image' ? m.image : m.document;
          let archivo = null;
          try { archivo = await descargarMedia(env, conexion, media.id); } catch { /* archivo muy grande o caído */ }
          if (!archivo) {
            await procesarEntrante(env, conexion, { ...base, tipo: 'texto', texto: media.caption || '[archivo que no se pudo descargar]' });
          } else if (m.type === 'image') {
            await procesarEntrante(env, conexion, { ...base, tipo: 'imagen', texto: media.caption || '', imagen: archivo });
          } else {
            await procesarEntrante(env, conexion, { ...base, tipo: 'documento', texto: media.caption || '', documento: { ...archivo, nombre: media.filename || 'archivo' } });
          }
        } else {
          const texto = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
          await procesarEntrante(env, conexion, { ...base, tipo: 'texto', texto: texto.slice(0, 2000) || `[${m.type}]` });
        }
      }
    }
  }
}
