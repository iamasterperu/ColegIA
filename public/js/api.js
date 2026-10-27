// Cliente de la API: cookies de sesión + cabecera anti-CSRF en cada escritura.
export class ErrorApi extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

async function llamar(metodo, ruta, datos) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: {} };
  if (metodo !== 'GET') {
    opciones.headers['x-colegia'] = '1';
    if (datos !== undefined) {
      opciones.headers['content-type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
  }
  const resp = await fetch(ruta, opciones);
  const tipo = resp.headers.get('content-type') || '';
  const cuerpo = tipo.includes('json') ? await resp.json() : await resp.blob();
  if (!resp.ok) {
    if (resp.status === 401 && !ruta.includes('/login')) window.dispatchEvent(new Event('colegia:sesion-vencida'));
    throw new ErrorApi(resp.status, cuerpo?.error || 'Error de conexión');
  }
  return cuerpo;
}

export const api = {
  get: (ruta) => llamar('GET', ruta),
  post: (ruta, datos = {}) => llamar('POST', ruta, datos),
  put: (ruta, datos = {}) => llamar('PUT', ruta, datos),
  del: (ruta) => llamar('DELETE', ruta),
};
