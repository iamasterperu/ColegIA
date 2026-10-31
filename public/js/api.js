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

// Sube un archivo tal cual (foto o PDF) como cuerpo de la petición
async function subir(ruta, archivo, tipo) {
  const resp = await fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: { 'x-colegia': '1', 'content-type': tipo }, body: archivo });
  const cuerpo = (resp.headers.get('content-type') || '').includes('json') ? await resp.json() : {};
  if (!resp.ok) {
    if (resp.status === 401) window.dispatchEvent(new Event('colegia:sesion-vencida'));
    throw new ErrorApi(resp.status, cuerpo?.error || 'No se pudo subir el archivo');
  }
  return cuerpo;
}

export const api = {
  subir,
  get: (ruta) => llamar('GET', ruta),
  post: (ruta, datos = {}) => llamar('POST', ruta, datos),
  put: (ruta, datos = {}) => llamar('PUT', ruta, datos),
  del: (ruta) => llamar('DELETE', ruta),
};
