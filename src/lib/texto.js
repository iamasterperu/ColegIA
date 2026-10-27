// Utilidades de texto compartidas por el Worker y las pruebas.
export const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const nombreBusqueda = (apellidos, nombres) => normalizar(`${apellidos} ${nombres}`);

// Teléfonos peruanos a E.164 sin '+': "987 654 321" -> "51987654321"
export function normalizarTelefono(t) {
  let d = String(t ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '51' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
