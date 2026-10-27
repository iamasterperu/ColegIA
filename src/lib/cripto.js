// Cifrado de secretos por colegio (tokens de WhatsApp) con AES-GCM.
// La clave maestra vive en el secreto MASTER_KEY del Worker, nunca en D1.
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function claveMaestra(env) {
  if (!env.MASTER_KEY) return null;
  const bytes = deB64(env.MASTER_KEY);
  if (bytes.length !== 32) throw new Error('MASTER_KEY debe ser de 32 bytes en base64');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrar(env, texto) {
  const clave = await claveMaestra(env);
  if (!clave) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(texto));
  return `v1.${b64(iv)}.${b64(datos)}`;
}

export async function descifrar(env, cifrado) {
  if (!cifrado) return null;
  const clave = await claveMaestra(env);
  if (!clave) return null;
  const [, iv, datos] = cifrado.split('.');
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, clave, deB64(datos));
  return new TextDecoder().decode(plano);
}

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

export async function hmacSha256(secreto, datos) {
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', clave, datos));
}

export function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function tokenAleatorio(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
