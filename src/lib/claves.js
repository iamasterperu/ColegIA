// Contraseñas con PBKDF2-SHA256. En producción 20 000 iteraciones costaban 9-17 ms de CPU
// y el ingreso fallaba por el límite de 10 ms del plan gratis; 5 000 cuestan unos 3 ms.
// El número se guarda en el hash para poder subirlo luego.
import { hex, igualSeguro } from './cripto.js';

export const ITERACIONES = 5000;

async function derivar(clave, sal, iteraciones) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: iteraciones },
    base, 256,
  );
  return hex(bits);
}

export async function hashClave(clave) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$${ITERACIONES}$${sal}$${await derivar(clave, sal, ITERACIONES)}`;
}

export async function verificarClave(clave, guardado) {
  const [tipo, it, sal, hash] = String(guardado).split('$');
  if (tipo !== 'pbkdf2') return false;
  return igualSeguro(await derivar(clave, sal, Number(it)), hash);
}

export function validarClaveNueva(clave) {
  if (typeof clave !== 'string' || clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe tener letras y números';
  return null;
}
