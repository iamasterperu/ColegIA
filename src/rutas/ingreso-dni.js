// Ingreso con DNI + celular (una sola vez por celular): el colegio ya registró a cada persona
// (personal en «Usuarios y roles», familias al matricular) y el sistema detecta su rol.
import { json, cuerpo, falla, cookieSesion, ip } from '../lib/http.js';
import { sha256, tokenAleatorio } from '../lib/cripto.js';
import { normalizarTelefono } from '../lib/texto.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';
import { CLAVE_PENDIENTE } from '../lib/invitaciones.js';

const MAX_FALLOS = 5;
const DURACION = 365 * 86400; // el celular queda registrado: entra con un toque durante un año
const MENSAJE = 'No encontramos ese DNI y celular en el colegio. Revisa los datos o pide a secretaría que los registre.';

export function rutasIngresoDni(r) {
  r.post('/api/ingreso-dni', async (ctx, env) => {
    const d = await cuerpo(ctx.request, 2000);
    const slug = String(d.colegio || '').trim().toLowerCase();
    const dni = String(d.dni || '').replace(/\D/g, '');
    const celular = normalizarTelefono(d.celular);
    if (!slug || dni.length < 8 || !celular) throw falla(400, 'Elige tu colegio y escribe tu DNI y tu celular');
    const colegio = await env.DB.prepare('SELECT id, suspendido FROM colegios WHERE slug = ?').bind(slug).first();
    const llave = `dni:${slug}:${dni}`;
    const llaveIp = `dni-ip:${ip(ctx.request)}`;
    const { results: intentos } = await env.DB.prepare('SELECT clave, fallos, bloqueado_hasta FROM intentos_login WHERE clave IN (?, ?)').bind(llave, llaveIp).all();
    if (intentos.some((i) => i.bloqueado_hasta && i.bloqueado_hasta > new Date().toISOString())) {
      throw falla(429, 'Demasiados intentos. Espera 15 minutos o pide ayuda a secretaría.');
    }
    const fallar = async () => {
      for (const k of [llave, llaveIp]) {
        const fallos = (intentos.find((i) => i.clave === k)?.fallos || 0) + 1;
        const limite = k === llave ? MAX_FALLOS : MAX_FALLOS * 4;
        const bloqueo = fallos >= limite ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
        await env.DB.prepare(
          `INSERT INTO intentos_login (clave, fallos, bloqueado_hasta) VALUES (?, ?, ?)
           ON CONFLICT(clave) DO UPDATE SET fallos = excluded.fallos, bloqueado_hasta = excluded.bloqueado_hasta`,
        ).bind(k, bloqueo ? 0 : fallos, bloqueo).run();
      }
      throw falla(401, MENSAJE);
    };
    if (!colegio) return fallar();

    // 1) Personal (dirección, secretaría, contabilidad, profesores…) por DNI y celular registrados
    let u = null;
    const { results: cand } = await env.DB.prepare("SELECT * FROM usuarios WHERE colegio_id = ? AND dni = ? AND activo = 1 AND rol != 'padre'").bind(colegio.id, dni).all();
    u = cand.find((x) => normalizarTelefono(x.telefono) === celular) || null;
    // 2) Familias: apoderado registrado al matricular a su hijo
    if (!u) {
      const { results: aps } = await env.DB.prepare(
        `SELECT ap.* FROM apoderados ap WHERE ap.colegio_id = ? AND ap.dni = ?
           AND EXISTS (SELECT 1 FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = ap.id AND a.estado = 'matriculado')`,
      ).bind(colegio.id, dni).all();
      const ap = aps.find((x) => normalizarTelefono(x.telefono) === celular);
      if (ap) {
        u = await env.DB.prepare("SELECT * FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? AND rol = 'padre' LIMIT 1").bind(colegio.id, ap.id).first();
        if (u && !u.activo) u = null;
        if (!u) {
          u = await env.DB.prepare(
            `INSERT INTO usuarios (colegio_id, nombre, email, rol, clave, apoderado_id, telefono)
             VALUES (?, ?, ?, 'padre', ?, ?, ?) ON CONFLICT (colegio_id, email) DO UPDATE SET apoderado_id = excluded.apoderado_id RETURNING *`,
          ).bind(colegio.id, `${ap.nombres} ${ap.apellidos}`, `${dni}@${slug}.familia`, CLAVE_PENDIENTE, ap.id, celular).first();
        }
      }
    }
    if (!u) return fallar();
    if (colegio.suspendido) throw falla(403, 'El servicio de este colegio está suspendido. Comunícate con la dirección.');

    const token = tokenAleatorio();
    const expira = new Date(Date.now() + DURACION * 1000).toISOString().replace('T', ' ').slice(0, 19);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sesiones (id, usuario_id, colegio_id, expira, ip) VALUES (?, ?, ?, ?, ?)').bind(await sha256(token), u.id, u.colegio_id, expira, ip(ctx.request)),
      env.DB.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?").bind(u.id),
      env.DB.prepare('DELETE FROM intentos_login WHERE clave = ?').bind(llave),
      sentenciaAuditoria(env, { request: ctx.request, colegioId: u.colegio_id, usuario: u }, 'login_dni'),
    ]);
    return json({ ok: true, rol: u.rol }, 200, { 'set-cookie': cookieSesion(token, DURACION) });
  });
}
