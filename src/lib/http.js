export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export const falla = (estado, mensaje) => new ErrorHttp(estado, mensaje);

export function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cabeceras,
    },
  });
}

export function leerCookie(request, nombre) {
  const cookie = request.headers.get('cookie') || '';
  for (const parte of cookie.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export function cookieSesion(token, maxAge) {
  return `colegia_sesion=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function cuerpo(request, maxBytes = 1_500_000) {
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > maxBytes) throw falla(413, 'El envío es demasiado grande');
  try {
    return await request.json();
  } catch {
    throw falla(400, 'JSON inválido');
  }
}

export const ip = (request) => request.headers.get('cf-connecting-ip') || '';

// Router mínimo: rutas tipo "/api/alumnos/:id/ficha"
export class Router {
  constructor() {
    this.rutas = [];
  }
  agregar(metodo, patron, manejador) {
    const nombres = [];
    const re = new RegExp(
      '^' + patron.replace(/:(\w+)/g, (_, n) => (nombres.push(n), '([^/]+)')) + '$',
    );
    this.rutas.push({ metodo, re, nombres, manejador });
  }
  get(p, m) { this.agregar('GET', p, m); }
  post(p, m) { this.agregar('POST', p, m); }
  put(p, m) { this.agregar('PUT', p, m); }
  delete(p, m) { this.agregar('DELETE', p, m); }
  buscar(metodo, ruta) {
    for (const r of this.rutas) {
      if (r.metodo !== metodo) continue;
      const m = ruta.match(r.re);
      if (m) {
        const params = {};
        r.nombres.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
        return { manejador: r.manejador, params };
      }
    }
    return null;
  }
}

export const hoyLima = (desplazamientoDias = 0) => {
  const d = new Date(Date.now() - 5 * 3600_000 + desplazamientoDias * 86400_000);
  return d.toISOString().slice(0, 10);
};

export const soles = (centimos) =>
  'S/ ' + (centimos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const entero = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
