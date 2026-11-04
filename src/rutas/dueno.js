// Panel privado del dueño de la plataforma: maneja todos los colegios, sus usuarios y sus accesos.
// No aparece enlazado en ninguna página; tiene su propio ingreso, aparte del de los colegios.
import { json, cuerpo, falla, leerCookie, entero } from '../lib/http.js';
import { verificarClave } from '../lib/claves.js';
import { sha256, tokenAleatorio } from '../lib/cripto.js';
import { ROLES } from '../lib/permisos.js';
import { esImagenOk } from '../lib/marca.js';
import { CLAVE_PENDIENTE, crearInvitacion, canjearInvitacion, leerInvitacion } from '../lib/invitaciones.js';

const DURACION = 30 * 86_400;
const CLAVE_RELLENO = 'pbkdf2$5000$00$' + '0'.repeat(64);
const cookie = (token, max) => `colegia_dueno=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${max}`;
const enlace = (env, token) => `${env.URL_BASE || 'https://colegia.iamasterperu.workers.dev'}/entrar?inv=${token}`;
const hoyMasDias = (s) => new Date(Date.now() + s * 1000).toISOString().replace('T', ' ').slice(0, 19);

async function duenoActual(env, request) {
  const token = leerCookie(request, 'colegia_dueno');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare("SELECT d.id, d.nombre, d.email FROM dueno_sesiones s JOIN duenos d ON d.id = s.dueno_id WHERE s.id = ? AND s.expira > datetime('now') AND d.activo = 1")
    .bind(await sha256(token)).first();
}
async function exigirDueno(ctx, env) {
  const d = await duenoActual(env, ctx.request);
  if (!d) throw falla(401, 'Inicia sesión');
  return d;
}
async function abrirSesion(env, duenoId) {
  const token = tokenAleatorio();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO dueno_sesiones (id, dueno_id, expira) VALUES (?, ?, ?)').bind(await sha256(token), duenoId, hoyMasDias(DURACION)),
    env.DB.prepare("UPDATE duenos SET ultimo_acceso = datetime('now') WHERE id = ?").bind(duenoId),
    env.DB.prepare("DELETE FROM dueno_sesiones WHERE expira < datetime('now')"),
  ]);
  return cookie(token, DURACION);
}
const colorOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);

export function rutasDueno(r) {
  r.post('/api/dueno/login', async (ctx, env) => {
    const { email, clave } = await cuerpo(ctx.request, 3000);
    const correo = String(email || '').trim().toLowerCase();
    const llave = `dueno:${correo}`;
    const intento = await env.DB.prepare('SELECT fallos, bloqueado_hasta FROM intentos_login WHERE clave = ?').bind(llave).first();
    if (intento?.bloqueado_hasta && intento.bloqueado_hasta > new Date().toISOString()) throw falla(429, 'Demasiados intentos. Espera 15 minutos.');
    const d = await env.DB.prepare('SELECT * FROM duenos WHERE email = ? AND activo = 1').bind(correo).first();
    const ok = await verificarClave(String(clave || ''), d?.clave ?? CLAVE_RELLENO);
    if (!d || !ok) {
      const fallos = (intento?.fallos || 0) + 1;
      const bloqueo = fallos >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      await env.DB.prepare('INSERT INTO intentos_login (clave, fallos, bloqueado_hasta) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET fallos = ?, bloqueado_hasta = ?')
        .bind(llave, fallos, bloqueo, fallos, bloqueo).run();
      throw falla(401, 'Correo o contraseña incorrectos');
    }
    await env.DB.prepare('DELETE FROM intentos_login WHERE clave = ?').bind(llave).run();
    return json({ ok: true }, 200, { 'set-cookie': await abrirSesion(env, d.id) });
  });

  r.post('/api/dueno/logout', async (ctx, env) => {
    const t = leerCookie(ctx.request, 'colegia_dueno');
    if (t) await env.DB.prepare('DELETE FROM dueno_sesiones WHERE id = ?').bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
  });

  r.get('/api/dueno/yo', async (ctx, env) => json({ dueno: await exigirDueno(ctx, env) }));

  // Primera vez: el enlace de activación permite crear la contraseña del dueño
  r.post('/api/dueno/activar', async (ctx, env) => {
    const { token, clave } = await cuerpo(ctx.request, 3000);
    const id = await canjearInvitacion(env, token, 'dueno', 'duenos', clave);
    return json({ ok: true }, 200, { 'set-cookie': await abrirSesion(env, id) });
  });

  r.get('/api/dueno/colegios', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.slug, c.nombre, c.nombre_corto, (c.icono IS NOT NULL) AS tiene_icono, (c.logo IS NOT NULL) AS tiene_logo, c.es_demo, c.suspendido, c.mostrar_en_ingreso, c.wa_modo, c.color_primario, c.color_secundario, c.creado_en,
        (SELECT COUNT(*) FROM usuarios u WHERE u.colegio_id = c.id AND u.rol != 'padre' AND u.activo = 1) AS usuarios,
        (SELECT COUNT(*) FROM alumnos a WHERE a.colegio_id = c.id AND a.estado = 'matriculado') AS alumnos,
        (SELECT MAX(ultimo_acceso) FROM usuarios u WHERE u.colegio_id = c.id) AS ultimo_acceso
       FROM colegios c ORDER BY c.es_demo, c.nombre`,
    ).all();
    return json({ colegios: results });
  });

  r.post('/api/dueno/colegios', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const d = await cuerpo(ctx.request, 1_200_000);
    const nombre = String(d.nombre || '').trim().slice(0, 100);
    const slug = String(d.slug || '').trim().toLowerCase();
    const correo = String(d.director_email || '').trim().toLowerCase();
    const dir = String(d.director_nombre || '').trim().slice(0, 80);
    if (!nombre || !/^[a-z0-9-]{3,30}$/.test(slug)) throw falla(400, 'Nombre del colegio y código (3 a 30 letras minúsculas, números o guiones) son obligatorios');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || !dir) throw falla(400, 'Nombre y correo de la directora son obligatorios');
    if (d.logo && !esImagenOk(d.logo, 150_000)) throw falla(400, 'Logo inválido o muy pesado');
    if (d.icono && !esImagenOk(d.icono, 900_000)) throw falla(400, 'Ícono inválido o muy pesado');
    const corto = String(d.nombre_corto || '').trim().slice(0, 20) || null;
    const c = await env.DB.prepare('INSERT INTO colegios (slug, nombre, nombre_corto, logo, icono, color_primario, color_secundario) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(slug, nombre, corto, d.logo || null, d.icono || null, colorOk(d.color_primario) || '#1e3a8a', colorOk(d.color_secundario) || '#f59e0b').first()
      .catch((e) => { if (String(e).includes('UNIQUE')) throw falla(409, 'Ya existe un colegio con ese código'); throw e; });
    const u = await env.DB.prepare("INSERT INTO usuarios (colegio_id, nombre, email, rol, clave) VALUES (?, ?, ?, 'direccion', ?) RETURNING id").bind(c.id, dir, correo, CLAVE_PENDIENTE).first();
    return json({ id: c.id, enlace: enlace(env, await crearInvitacion(env, 'usuario', u.id)) }, 201);
  });

  r.put('/api/dueno/colegios/:id', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const id = entero(ctx.params.id);
    const d = await cuerpo(ctx.request, 1_200_000);
    const sets = [], vals = [];
    if (typeof d.nombre_corto === 'string') { sets.push('nombre_corto = ?'); vals.push(d.nombre_corto.trim().slice(0, 20) || null); }
    if ('logo' in d) { if (d.logo && !esImagenOk(d.logo, 150_000)) throw falla(400, 'Logo inválido o muy pesado'); sets.push('logo = ?'); vals.push(d.logo || null); }
    if ('icono' in d) { if (d.icono && !esImagenOk(d.icono, 900_000)) throw falla(400, 'Ícono inválido o muy pesado'); sets.push('icono = ?'); vals.push(d.icono || null); }
    if (typeof d.nombre === 'string' && d.nombre.trim()) { sets.push('nombre = ?'); vals.push(d.nombre.trim().slice(0, 100)); }
    if (colorOk(d.color_primario)) { sets.push('color_primario = ?'); vals.push(d.color_primario); }
    if (colorOk(d.color_secundario)) { sets.push('color_secundario = ?'); vals.push(d.color_secundario); }
    for (const k of ['suspendido', 'mostrar_en_ingreso']) if (typeof d[k] === 'boolean') { sets.push(`${k} = ?`); vals.push(d[k] ? 1 : 0); }
    if (!sets.length) throw falla(400, 'Nada que cambiar');
    const res = await env.DB.prepare(`UPDATE colegios SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
    if (!res.meta.changes) throw falla(404, 'Colegio no encontrado');
    if (d.suspendido === true) await env.DB.prepare('DELETE FROM sesiones WHERE colegio_id = ?').bind(id).run();
    return json({ ok: true });
  });

  r.get('/api/dueno/colegios/:id/usuarios', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const { results } = await env.DB.prepare(
      "SELECT id, nombre, email, rol, activo, ultimo_acceso, (clave != ?) AS con_clave FROM usuarios WHERE colegio_id = ? AND rol != 'padre' ORDER BY rol, nombre",
    ).bind(CLAVE_PENDIENTE, entero(ctx.params.id)).all();
    return json({ usuarios: results });
  });

  r.post('/api/dueno/colegios/:id/usuarios', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const d = await cuerpo(ctx.request, 3000);
    const correo = String(d.email || '').trim().toLowerCase(), nombre = String(d.nombre || '').trim().slice(0, 80);
    if (!ROLES[d.rol] || d.rol === 'padre') throw falla(400, 'Puesto inválido');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || !nombre) throw falla(400, 'Nombre y correo válidos son obligatorios');
    const u = await env.DB.prepare('INSERT INTO usuarios (colegio_id, nombre, email, rol, clave) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(entero(ctx.params.id), nombre, correo, d.rol, CLAVE_PENDIENTE).first()
      .catch((e) => { if (String(e).includes('UNIQUE')) throw falla(409, 'Ya existe un usuario con ese correo en ese colegio'); throw e; });
    return json({ id: u.id, enlace: enlace(env, await crearInvitacion(env, 'usuario', u.id)) }, 201);
  });

  // Nuevo enlace para crear o cambiar contraseña (cierra las sesiones abiertas de esa persona)
  r.post('/api/dueno/usuarios/:id/enlace', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const id = entero(ctx.params.id);
    const u = await env.DB.prepare("SELECT id FROM usuarios WHERE id = ? AND rol != 'padre'").bind(id).first();
    if (!u) throw falla(404, 'Usuario no encontrado');
    await env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id).run();
    return json({ enlace: enlace(env, await crearInvitacion(env, 'usuario', id)) });
  });

  r.put('/api/dueno/usuarios/:id', async (ctx, env) => {
    await exigirDueno(ctx, env);
    const d = await cuerpo(ctx.request, 1000);
    const id = entero(ctx.params.id);
    await env.DB.prepare("UPDATE usuarios SET activo = ? WHERE id = ? AND rol != 'padre'").bind(d.activo ? 1 : 0, id).run();
    if (!d.activo) await env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id).run();
    return json({ ok: true });
  });

  // ---- Públicas: lista de colegios para el ingreso y enlaces de creación de contraseña ----
  r.get('/api/publico/colegios', async (ctx, env) => {
    const { results } = await env.DB.prepare('SELECT slug, nombre FROM colegios WHERE mostrar_en_ingreso = 1 AND suspendido = 0 ORDER BY es_demo, nombre').all();
    return json({ colegios: results });
  });
  r.get('/api/publico/invitacion/:token', async (ctx, env) => {
    const inv = await leerInvitacion(env, ctx.params.token, 'usuario');
    const u = await env.DB.prepare('SELECT u.nombre, u.rol, c.nombre AS colegio, c.slug FROM usuarios u JOIN colegios c ON c.id = u.colegio_id WHERE u.id = ?').bind(inv.ref_id).first();
    if (!u) throw falla(404, 'Este enlace no es válido');
    return json({ nombre: u.nombre, rol: u.rol, colegio: u.colegio, slug: u.slug });
  });
  r.post('/api/publico/invitacion/:token', async (ctx, env) => {
    const { clave } = await cuerpo(ctx.request, 2000);
    await canjearInvitacion(env, ctx.params.token, 'usuario', 'usuarios', clave);
    return json({ ok: true });
  });
  r.get('/api/publico/dueno-invitacion/:token', async (ctx, env) => {
    await leerInvitacion(env, ctx.params.token, 'dueno');
    return json({ ok: true });
  });
}
