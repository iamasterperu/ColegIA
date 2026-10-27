// Limpieza diaria: mantiene la base dentro de los 5 GB del plan gratis y aplica
// el principio de conservación limitada (Ley 29733): lo que ya no se necesita, se borra.
export const DIAS_AUDIO = 90;

export async function limpiar(env) {
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM mensajes_audio WHERE mensaje_id IN (SELECT id FROM mensajes WHERE tipo = 'audio' AND creado_en < datetime('now', ?))`,
    ).bind(`-${DIAS_AUDIO} days`),
    env.DB.prepare("DELETE FROM sesiones WHERE expira < datetime('now')"),
    env.DB.prepare("DELETE FROM intentos_login WHERE bloqueado_hasta IS NULL OR bloqueado_hasta < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')"),
  ]);
}
