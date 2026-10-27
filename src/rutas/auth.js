import { json, cuerpo, falla, cookieSesion, ip, leerCookie } from '../lib/http.js';
import { verificarClave, hashClave, validarClaveNueva } from '../lib/claves.js';
import { sha256, tokenAleatorio } from '../lib/cripto.js';
import { PERMISOS, ROLES } from '../lib/permisos.js';
import { DURACION_SESION, exigir } from '../lib/sesion.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { FINALIDADES, textoFinalidad } from '../lib/consentimiento.js';

const MAX_FALLOS = 5;
// Hash de relleno: si el correo no existe se calcula igual, así el tiempo de respuesta no lo delata.
const CLAVE_RELLENO = 'pbkdf2$5000$00000000000000000000000000000000$' + '0'.repeat(64);

export function colegioPublico(c) {
  return {
    slug: c.slug, nombre: c.nombre, logo: c.logo, color_primario: c.color_primario,
    color_secundario: c.color_secundario, ruc: c.ruc, direccion: c.direccion,
    email_privacidad: c.email_privacidad, registro_banco_datos: c.registro_banco_datos,
    es_demo: !!c.es_demo, anio_escolar: c.anio_escolar,
  };
}

export function rutasAuth(r) {
  // Datos públicos del colegio para la pantalla de ingreso y el aviso de privacidad.
  r.get('/api/publico/colegio/:slug', async (ctx, env) => {
    const c = await env.DB.prepare('SELECT * FROM colegios WHERE slug = ?').bind(ctx.params.slug.toLowerCase()).first();
    if (!c) throw falla(404, 'No encontramos ese colegio');
    const datos = colegioPublico(c);
    datos.finalidades = Object.fromEntries(
      Object.entries(FINALIDADES).map(([k, f]) => [k, { ...f, texto: textoFinalidad(k, c.nombre) }]),
    );
    if (c.es_demo) {
      const { results } = await env.DB.prepare(
        `SELECT email, rol, nombre FROM usuarios WHERE colegio_id = ? AND activo = 1 AND (rol != 'padre' OR ? = 1)
          AND id IN (SELECT MIN(id) FROM usuarios WHERE colegio_id = ? GROUP BY rol) ORDER BY id`,
      ).bind(c.id, c.portal_padres, c.id).all();
      datos.usuarios_demo = results;
    }
    return json(datos);
  });

  r.get('/api/publico/colegios-demo', async (ctx, env) => {
    const { results } = await env.DB.prepare('SELECT slug, nombre FROM colegios WHERE es_demo = 1 ORDER BY id').all();
    return json(results);
  });

  r.post('/api/login', async (ctx, env) => {
    const { colegio, email, clave } = await cuerpo(ctx.request, 4000);
    if (!colegio || !email || !clave) throw falla(400, 'Completa colegio, correo y contraseña');
    const slug = String(colegio).trim().toLowerCase();
    const correo = String(email).trim().toLowerCase();
    const llave = `${slug}:${correo}`;

    const intento = await env.DB.prepare('SELECT fallos, bloqueado_hasta FROM intentos_login WHERE clave = ?').bind(llave).first();
    if (intento?.bloqueado_hasta && intento.bloqueado_hasta > new Date().toISOString()) {
      throw falla(429, 'Demasiados intentos. Espera 15 minutos o pide a dirección que restablezca tu contraseña.');
    }
    const u = await env.DB.prepare(
      `SELECT u.*, c.slug, c.portal_padres FROM usuarios u JOIN colegios c ON c.id = u.colegio_id
        WHERE c.slug = ? AND u.email = ? AND u.activo = 1`,
    ).bind(slug, correo).first();

    const valida = await verificarClave(String(clave), u?.clave ?? CLAVE_RELLENO);
    if (!u || !valida) {
      const fallos = (intento?.fallos || 0) + 1;
      const bloqueo = fallos >= MAX_FALLOS ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      await env.DB.prepare(
        `INSERT INTO intentos_login (clave, fallos, bloqueado_hasta) VALUES (?, ?, ?)
         ON CONFLICT(clave) DO UPDATE SET fallos = excluded.fallos, bloqueado_hasta = excluded.bloqueado_hasta`,
      ).bind(llave, bloqueo ? 0 : fallos, bloqueo).run();
      if (u) await auditar(env, { request: ctx.request, colegioId: u.colegio_id, usuario: u }, 'login_fallido');
      throw falla(401, 'Correo o contraseña incorrectos');
    }

    if (u.rol === 'padre' && !u.portal_padres) {
      throw falla(403, 'Los padres de este colegio se atienden por WhatsApp: escribe al número del colegio.');
    }
    const token = tokenAleatorio();
    const expira = new Date(Date.now() + DURACION_SESION * 1000).toISOString().replace('T', ' ').slice(0, 19);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sesiones (id, usuario_id, colegio_id, expira, ip) VALUES (?, ?, ?, ?, ?)')
        .bind(await sha256(token), u.id, u.colegio_id, expira, ip(ctx.request)),
      env.DB.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?").bind(u.id),
      env.DB.prepare('DELETE FROM intentos_login WHERE clave = ?').bind(llave),
      env.DB.prepare("DELETE FROM sesiones WHERE usuario_id = ? AND expira < datetime('now')").bind(u.id),
      sentenciaAuditoria(env, { request: ctx.request, colegioId: u.colegio_id, usuario: u }, 'login'),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': cookieSesion(token, DURACION_SESION) });
  });

  r.post('/api/logout', async (ctx, env) => {
    const token = leerCookie(ctx.request, 'colegia_sesion');
    if (token) await env.DB.prepare('DELETE FROM sesiones WHERE id = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieSesion('', 0) });
  });

  r.get('/api/yo', async (ctx, env) => {
    exigir(ctx);
    const c = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const u = ctx.usuario;
    let secciones = [];
    if (u.rol === 'profesor') {
      secciones = (await env.DB.prepare('SELECT grado, seccion, curso FROM profesor_secciones WHERE usuario_id = ?').bind(u.id).all()).results;
    }
    return json({
      usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, rol_nombre: ROLES[u.rol], secciones },
      permisos: PERMISOS[u.rol],
      colegio: { ...colegioPublico(c), wa_modo: c.wa_modo },
      finalidades: Object.fromEntries(
        Object.entries(FINALIDADES).map(([k, f]) => [k, { ...f, texto: textoFinalidad(k, c.nombre) }]),
      ),
    });
  });

  r.post('/api/cambiar-clave', async (ctx, env) => {
    exigir(ctx);
    const { actual, nueva } = await cuerpo(ctx.request, 4000);
    const fila = await env.DB.prepare('SELECT clave FROM usuarios WHERE id = ?').bind(ctx.usuario.id).first();
    if (!(await verificarClave(String(actual || ''), fila.clave))) throw falla(400, 'La contraseña actual no es correcta');
    const error = validarClaveNueva(nueva);
    if (error) throw falla(400, error);
    await env.DB.batch([
      env.DB.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').bind(await hashClave(nueva), ctx.usuario.id),
      env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND id != ?').bind(ctx.usuario.id, ctx.usuario.sesion_id),
      sentenciaAuditoria(env, ctx, 'cambiar_clave', 'usuario', ctx.usuario.id),
    ]);
    return json({ ok: true });
  });
}
