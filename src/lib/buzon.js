// Buzón del chat privado: lo que el colegio envía a una persona (recordatorios, avisos, constancias)
// también aparece en su chat dentro de la app, con contador de no leídos.
import { normalizarTelefono } from './texto.js';

export const lineaInterna = (usuarioId) => `51988${String(usuarioId).padStart(6, '0')}`;

// Cuentas de la app que corresponden al destinatario de un mensaje
async function destinatarios(env, colegioId, m) {
  if (m.usuarioId) return [m.usuarioId];
  const ids = [];
  if (m.apoderadoId) {
    const { results } = await env.DB.prepare("SELECT id FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? AND rol = 'padre' AND activo = 1").bind(colegioId, m.apoderadoId).all();
    ids.push(...results.map((x) => x.id));
  } else if (normalizarTelefono(m.telefono)) {
    const tel = normalizarTelefono(m.telefono);
    const { results } = await env.DB.prepare(
      `SELECT id FROM usuarios WHERE colegio_id = ? AND activo = 1 AND (telefono = ? OR (rol = 'padre' AND apoderado_id IN (SELECT id FROM apoderados WHERE colegio_id = ? AND telefono = ?)))`,
    ).bind(colegioId, tel, colegioId, tel).all();
    ids.push(...results.map((x) => x.id));
  }
  return ids;
}

export async function copiarAlBuzon(env, colegioId, m, texto, tipo = 'texto') {
  try {
    for (const id of await destinatarios(env, colegioId, m)) {
      const linea = lineaInterna(id);
      if (linea === m.telefono) continue; // es una respuesta del propio chat
      await env.DB.prepare(
        `INSERT INTO mensajes (colegio_id, telefono, usuario_id, sentido, tipo, texto, canal, motivo, estado)
         VALUES (?, ?, ?, 'saliente', ?, ?, 'simulado', ?, 'ok')`,
      ).bind(colegioId, linea, id, tipo === 'plantilla' ? 'texto' : tipo, texto, m.motivo || 'aviso').run();
    }
  } catch (e) { console.error('buzon', e); }
}
