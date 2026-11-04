// Notificaciones push (Web Push + VAPID) sin dependencias. El aviso va SIN contenido: el celular
// recibe el "toque" y la app pide a ColegIA el texto con su propia sesión, así nada privado
// viaja por los servidores de Google o Apple.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function claves(env) {
  let f = await env.DB.prepare('SELECT publica, privada FROM push_config WHERE id = 1').first();
  if (!f) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publica = b64u(await crypto.subtle.exportKey('raw', par.publicKey));
    const privada = JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey));
    await env.DB.prepare('INSERT OR IGNORE INTO push_config (id, publica, privada) VALUES (1, ?, ?)').bind(publica, privada).run();
    f = await env.DB.prepare('SELECT publica, privada FROM push_config WHERE id = 1').first();
  }
  return f;
}

export async function firmaVapid(env, endpoint) {
  const { publica, privada } = await claves(env);
  const clave = await crypto.subtle.importKey('jwk', JSON.parse(privada), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const carga = b64u(new TextEncoder().encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.URL_BASE || 'https://colegia.iamasterperu.workers.dev',
  })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, new TextEncoder().encode(`${cab}.${carga}`));
  return { jwt: `${cab}.${carga}.${b64u(firma)}`, publica };
}

// Avisa a todos los celulares de una persona. Quita las suscripciones que ya no existen.
export async function avisarPush(env, usuarioId) {
  const estados = [];
  try {
    const { results } = await env.DB.prepare('SELECT id, endpoint FROM push_suscripciones WHERE usuario_id = ?').bind(usuarioId).all();
    for (const s of results) {
      try {
        const { jwt, publica } = await firmaVapid(env, s.endpoint);
        const r = await fetch(s.endpoint, { method: 'POST', headers: { authorization: `vapid t=${jwt}, k=${publica}`, ttl: '86400', urgency: 'high', 'content-length': '0' } });
        estados.push(r.status);
        if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_suscripciones WHERE id = ?').bind(s.id).run();
        else await env.DB.prepare("UPDATE push_suscripciones SET ultimo_estado = ?, ultimo_envio = datetime('now') WHERE id = ?").bind(String(r.status), s.id).run().catch(() => {});
      } catch (e) { estados.push('error'); console.error('push', e); }
    }
  } catch (e) { console.error('push', e); }
  return estados;
}
export { deB64u };
