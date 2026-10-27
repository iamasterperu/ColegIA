import { json, cuerpo, falla, entero } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { ROLES } from '../lib/permisos.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { hashClave, validarClaveNueva } from '../lib/claves.js';
import { cifrar, tokenAleatorio } from '../lib/cripto.js';
import { normalizarTelefono } from '../lib/texto.js';
import { cargarConexion, probarConexion } from '../whatsapp/envio.js';

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function rutasAdmin(r) {
  // ---- Usuarios ----
  r.get('/api/usuarios', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.ultimo_acceso, u.apoderado_id, u.telefono,
              (SELECT GROUP_CONCAT(grado || ' ' || seccion, ', ') FROM profesor_secciones ps WHERE ps.usuario_id = u.id) AS secciones
         FROM usuarios u WHERE u.colegio_id = ? ORDER BY u.rol, u.nombre`,
    ).bind(ctx.colegioId).all();
    return json(results);
  });

  r.post('/api/usuarios', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const d = await cuerpo(ctx.request, 5000);
    const email = String(d.email || '').trim().toLowerCase();
    const nombre = String(d.nombre || '').trim().slice(0, 80);
    if (!ROLES[d.rol]) throw falla(400, 'Rol inválido');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nombre) throw falla(400, 'Nombre y correo válidos son obligatorios');
    const error = validarClaveNueva(d.clave);
    if (error) throw falla(400, error);
    let apoderadoId = null;
    if (d.rol === 'padre') {
      const ap = await env.DB.prepare('SELECT id FROM apoderados WHERE colegio_id = ? AND (dni = ? OR id = ?)')
        .bind(ctx.colegioId, String(d.apoderado_dni || ''), entero(d.apoderado_id)).first();
      if (!ap) throw falla(400, 'Para un padre, indica el DNI de un apoderado registrado');
      apoderadoId = ap.id;
    }
    const telefono = d.telefono ? normalizarTelefono(d.telefono) : null;
    if (d.telefono && !telefono) throw falla(400, 'Celular inválido');
    const fila = await env.DB.prepare(
      'INSERT INTO usuarios (colegio_id, nombre, email, rol, clave, apoderado_id, telefono) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(ctx.colegioId, nombre, email, d.rol, await hashClave(d.clave), apoderadoId, telefono).first().catch((e) => {
      if (String(e).includes('UNIQUE')) throw falla(409, 'Ya existe un usuario con ese correo');
      throw e;
    });
    const secciones = d.rol === 'profesor' ? parseSecciones(d.secciones) : [];
    await env.DB.batch([
      ...secciones.map((s) => env.DB.prepare('INSERT OR IGNORE INTO profesor_secciones (usuario_id, grado, seccion) VALUES (?, ?, ?)').bind(fila.id, s.grado, s.seccion)),
      sentenciaAuditoria(env, ctx, 'crear_usuario', 'usuario', fila.id, { rol: d.rol }),
    ]);
    return json({ id: fila.id }, 201);
  });

  r.put('/api/usuarios/:id', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const d = await cuerpo(ctx.request, 5000);
    const id = entero(ctx.params.id);
    const u = await env.DB.prepare('SELECT * FROM usuarios WHERE id = ? AND colegio_id = ?').bind(id, ctx.colegioId).first();
    if (!u) throw falla(404, 'Usuario no encontrado');
    if (id === ctx.usuario.id && d.activo === false) throw falla(400, 'No puedes desactivarte a ti mismo');
    const lotes = [];
    if ('activo' in d) {
      lotes.push(env.DB.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').bind(d.activo ? 1 : 0, id));
      if (!d.activo) lotes.push(env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id));
    }
    if ('telefono' in d) {
      const telefono = d.telefono ? normalizarTelefono(d.telefono) : null;
      if (d.telefono && !telefono) throw falla(400, 'Celular inválido');
      lotes.push(env.DB.prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').bind(telefono, id));
    }
    if (d.clave) {
      const error = validarClaveNueva(d.clave);
      if (error) throw falla(400, error);
      lotes.push(env.DB.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').bind(await hashClave(d.clave), id));
      lotes.push(env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id));
    }
    if (u.rol === 'profesor' && 'secciones' in d) {
      lotes.push(env.DB.prepare('DELETE FROM profesor_secciones WHERE usuario_id = ?').bind(id));
      for (const s of parseSecciones(d.secciones)) {
        lotes.push(env.DB.prepare('INSERT OR IGNORE INTO profesor_secciones (usuario_id, grado, seccion) VALUES (?, ?, ?)').bind(id, s.grado, s.seccion));
      }
    }
    lotes.push(sentenciaAuditoria(env, ctx, 'editar_usuario', 'usuario', id, { campos: Object.keys(d).filter((k) => k !== 'clave').concat(d.clave ? ['clave'] : []) }));
    await env.DB.batch(lotes);
    return json({ ok: true });
  });

  // ---- Ajustes del colegio (marca y WhatsApp) ----
  r.get('/api/ajustes', async (ctx, env) => {
    exigir(ctx, 'ajustes.editar');
    const c = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const { wa_token_cifrado, wa_app_secret_cifrado, ...resto } = c;
    return json({
      ...resto,
      wa_tiene_token: !!wa_token_cifrado,
      wa_tiene_app_secret: !!wa_app_secret_cifrado,
      master_key_configurada: !!env.MASTER_KEY,
      ai_configurada: !!env.AI,
      webhook_url: `${ctx.url.origin}/webhook/whatsapp/${c.slug}`,
    });
  });

  r.put('/api/ajustes', async (ctx, env) => {
    exigir(ctx, 'ajustes.editar');
    const d = await cuerpo(ctx.request, 150_000);
    const c = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const t = (k, n) => (k in d ? String(d[k] ?? '').trim().slice(0, n) || null : c[k]);
    if (d.logo && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(d.logo)) throw falla(400, 'Logo inválido');
    if (d.logo && d.logo.length > 120_000) throw falla(413, 'El logo pesa demasiado; usa uno más pequeño');
    for (const k of ['color_primario', 'color_secundario']) if (k in d && !COLOR.test(d[k])) throw falla(400, 'Color inválido');
    const modo = d.wa_modo === 'cloud' ? 'cloud' : d.wa_modo === 'simulado' ? 'simulado' : c.wa_modo;

    let token = c.wa_token_cifrado;
    let appSecret = c.wa_app_secret_cifrado;
    if (d.wa_token || d.wa_app_secret) {
      if (!env.MASTER_KEY) throw falla(409, 'Falta configurar el secreto MASTER_KEY del Worker (ver README).');
      if (d.wa_token) token = await cifrar(env, String(d.wa_token).trim());
      if (d.wa_app_secret) appSecret = await cifrar(env, String(d.wa_app_secret).trim());
    }
    if (d.borrar_credenciales) { token = null; appSecret = null; }
    if (modo === 'cloud' && (!token || !t('wa_phone_number_id', 40))) {
      throw falla(400, 'Para usar WhatsApp real pega el Phone number ID y el token de acceso');
    }
    const linkPago = 'link_pago' in d ? (String(d.link_pago || '').trim().slice(0, 300) || null) : c.link_pago;
    if (linkPago && !/^https:\/\//.test(linkPago)) throw falla(400, 'El link de pago debe empezar con https://');
    const numeros = 'wa_numeros_prueba' in d
      ? String(d.wa_numeros_prueba || '').split(/[\s,;]+/).map(normalizarTelefono).filter(Boolean).join(',') || null
      : c.wa_numeros_prueba;

    // Los celulares del demo son inventados: en un colegio demo no se envía a WhatsApp real
    // sin una lista de números de prueba.
    if (c.es_demo && modo === 'cloud' && !numeros) {
      throw falla(400, 'En el colegio de demostración agrega tus números de prueba antes de usar WhatsApp real.');
    }
    await env.DB.prepare(
      `UPDATE colegios SET nombre = ?, ruc = ?, direccion = ?, telefono = ?, email_privacidad = ?, logo = ?,
         color_primario = ?, color_secundario = ?, info_pago = ?, registro_banco_datos = ?,
         wa_modo = ?, wa_phone_number_id = ?, wa_token_cifrado = ?, wa_app_secret_cifrado = ?, wa_verify_token = ?,
         wa_plantilla_recordatorio = ?, wa_plantilla_aviso = ?, wa_plantilla_idioma = ?, wa_numeros_prueba = ?,
         recordatorio_auto = ?, recordatorio_dias_antes = ?, portal_padres = ?, wa_plantilla_bienvenida = ?,
         link_pago = ?, alertas_padres = ?, resumen_diario = ?
       WHERE id = ?`,
    ).bind(
      t('nombre', 120) || c.nombre, t('ruc', 11), t('direccion', 200), t('telefono', 30), t('email_privacidad', 120),
      'logo' in d ? d.logo || null : c.logo,
      d.color_primario || c.color_primario, d.color_secundario || c.color_secundario,
      t('info_pago', 1000), t('registro_banco_datos', 60),
      modo, t('wa_phone_number_id', 40), token, appSecret, t('wa_verify_token', 80) || c.wa_verify_token || tokenAleatorio(16),
      t('wa_plantilla_recordatorio', 60), t('wa_plantilla_aviso', 60), t('wa_plantilla_idioma', 10) || 'es', numeros,
      'recordatorio_auto' in d ? (d.recordatorio_auto ? 1 : 0) : c.recordatorio_auto,
      'recordatorio_dias_antes' in d ? Math.min(15, Math.max(1, entero(d.recordatorio_dias_antes, 3))) : c.recordatorio_dias_antes,
      'portal_padres' in d ? (d.portal_padres ? 1 : 0) : c.portal_padres, t('wa_plantilla_bienvenida', 60),
      linkPago, 'alertas_padres' in d ? (d.alertas_padres ? 1 : 0) : c.alertas_padres,
      'resumen_diario' in d ? (d.resumen_diario ? 1 : 0) : c.resumen_diario,
      ctx.colegioId,
    ).run();
    await auditar(env, ctx, 'editar_ajustes', 'colegio', ctx.colegioId, {
      campos: Object.keys(d).map((k) => (k === 'wa_token' || k === 'wa_app_secret' ? `${k} (cambiado)` : k)),
    });
    return json({ ok: true });
  });

  r.post('/api/ajustes/probar-whatsapp', async (ctx, env) => {
    exigir(ctx, 'ajustes.editar');
    const c = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const conexion = await cargarConexion(env, { ...c, wa_modo: 'cloud' });
    if (conexion.modo !== 'cloud') throw falla(400, 'Primero guarda el Phone number ID y el token');
    try {
      const datos = await probarConexion(env, conexion);
      return json({ ok: true, numero: datos.display_phone_number, nombre: datos.verified_name, calidad: datos.quality_rating });
    } catch (e) {
      throw falla(502, `WhatsApp respondió: ${e.message}`);
    }
  });
}

export function parseSecciones(v) {
  // "3° Primaria A, 4° Primaria B" -> [{grado:'3° Primaria', seccion:'A'}, ...]
  const lista = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/);
  return lista.map((x) => {
    if (typeof x === 'object') return { grado: String(x.grado).trim(), seccion: String(x.seccion).trim() };
    const m = String(x).trim().match(/^(.+)\s+([A-Z])$/i);
    return m ? { grado: gradoOficial(m[1]), seccion: m[2].toUpperCase() } : null;
  }).filter((x) => x && x.grado).slice(0, 30);
}

// "3ro primaria", "3 Primaria", "3er grado de primaria" -> "3° Primaria" (como en la matrícula)
function gradoOficial(g) {
  const m = String(g).trim().match(/^(\d)\s*(?:°|º|ro|do|to|er|vo|mo|no)?\.?\s*(?:grado\s*)?(?:de\s*)?(primaria|secundaria)$/i);
  return m ? `${m[1]}° ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}` : String(g).trim();
}
