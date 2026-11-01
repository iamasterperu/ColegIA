// Enlaces de un solo uso para que cada persona cree su propia contraseña (nadie recibe una clave por chat).
import { sha256, tokenAleatorio } from './cripto.js';
import { hashClave, validarClaveNueva } from './claves.js';
import { falla } from './http.js';

export const CLAVE_PENDIENTE = 'pendiente';
const DIAS = 7;
const expira = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);

export async function crearInvitacion(env, tipo, refId) {
  const token = tokenAleatorio(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invitaciones WHERE tipo = ? AND ref_id = ?').bind(tipo, refId),
    env.DB.prepare('INSERT INTO invitaciones (id, tipo, ref_id, expira) VALUES (?, ?, ?, ?)').bind(await sha256(token), tipo, refId, expira(DIAS)),
  ]);
  return token;
}

export async function leerInvitacion(env, token, tipo) {
  if (!/^[a-f0-9]{48}$/.test(String(token))) throw falla(404, 'Este enlace no es válido');
  const f = await env.DB.prepare("SELECT * FROM invitaciones WHERE id = ? AND tipo = ? AND usado = 0 AND expira > datetime('now')").bind(await sha256(token), tipo).first();
  if (!f) throw falla(404, 'Este enlace venció o ya se usó. Pide uno nuevo.');
  return f;
}

// Guarda la contraseña elegida y gasta el enlace. Devuelve el id de la persona.
export async function canjearInvitacion(env, token, tipo, tabla, clave) {
  const error = validarClaveNueva(clave);
  if (error) throw falla(400, error);
  const inv = await leerInvitacion(env, token, tipo);
  const [gasto] = await env.DB.batch([
    env.DB.prepare('UPDATE invitaciones SET usado = 1 WHERE id = ? AND usado = 0').bind(inv.id),
    env.DB.prepare(`UPDATE ${tabla} SET clave = ? WHERE id = ?`).bind(await hashClave(clave), inv.ref_id),
  ]);
  if (!gasto.meta.changes) throw falla(404, 'Este enlace ya se usó');
  return inv.ref_id;
}
