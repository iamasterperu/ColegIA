// Registro de quién ve qué. Cada lectura de datos personales deja una fila.
import { ip } from './http.js';

export function sentenciaAuditoria(env, ctx, accion, entidad = null, entidadId = null, detalle = null) {
  const u = ctx.usuario || {};
  return env.DB.prepare(
    `INSERT INTO auditoria (colegio_id, usuario_id, usuario_nombre, rol, accion, entidad, entidad_id, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    ctx.colegioId ?? u.colegio_id, u.id ?? null, u.nombre ?? null, u.rol ?? null, accion, entidad,
    entidadId, detalle == null ? null : typeof detalle === 'string' ? detalle : JSON.stringify(detalle),
    ctx.request ? ip(ctx.request) : null,
  );
}

export const auditar = (env, ctx, ...args) => sentenciaAuditoria(env, ctx, ...args).run();
