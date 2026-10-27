import { falla, leerCookie } from './http.js';
import { sha256 } from './cripto.js';
import { tiene } from './permisos.js';

export const DURACION_SESION = 8 * 3600; // 8 horas

export async function usuarioDeSesion(env, request) {
  const token = leerCookie(request, 'colegia_sesion');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const fila = await env.DB.prepare(
    `SELECT u.id, u.colegio_id, u.nombre, u.email, u.rol, u.apoderado_id, s.id AS sesion_id
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ? AND s.expira > datetime('now') AND u.activo = 1`,
  ).bind(await sha256(token)).first();
  return fila || null;
}

export function exigir(ctx, permiso) {
  if (!ctx.usuario) throw falla(401, 'Inicia sesión');
  if (permiso && !tiene(ctx.usuario, permiso)) throw falla(403, 'Tu rol no tiene acceso a esta información');
}
