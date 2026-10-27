// Lector mínimo de Excel (.xlsx) y CSV que corre en el navegador, sin librerías.
// Un .xlsx es un ZIP con XML: leemos el directorio del ZIP, descomprimimos con
// DecompressionStream y sacamos las celdas de la primera hoja.

const dec = new TextDecoder();

async function inflar(datos) {
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Devuelve { nombre: () => Promise<Uint8Array> } para cada archivo del ZIP
export function leerZip(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no es un Excel .xlsx válido');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = {};
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP dañado');
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = b.subarray(inicio, inicio + comprimido);
    archivos[nombre] = () => (metodo === 0 ? Promise.resolve(datos) : metodo === 8 ? inflar(datos) : Promise.reject(new Error('Compresión no soportada')));
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return archivos;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desEscapar = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTIDADES[e] ?? m;
});
const textoDe = (xml) => desEscapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

const columna = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Fecha de Excel (número de serie) -> 'AAAA-MM-DD'
export const fechaExcel = (serie) => new Date(Math.round((Number(serie) - 25569) * 86400000)).toISOString().slice(0, 10);

export async function leerXlsx(buffer) {
  const zip = leerZip(buffer);
  const leer = async (n) => (zip[n] ? dec.decode(await zip[n]()) : null);
  // Primera hoja según workbook.xml + sus relaciones
  const libro = await leer('xl/workbook.xml');
  if (!libro) throw new Error('El archivo no es un Excel .xlsx válido');
  const relaciones = (await leer('xl/_rels/workbook.xml.rels')) || '';
  const primera = libro.match(/<sheet\b[^>]*?r:id="([^"]+)"/);
  let ruta = 'xl/worksheets/sheet1.xml';
  if (primera) {
    const rel = [...relaciones.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${primera[1]}"`));
    const destino = rel?.match(/Target="([^"]+)"/)?.[1];
    if (destino) ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
  }
  const compartidos = [...((await leer('xl/sharedStrings.xml')) || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  // Estilos de fecha: numFmtId 14-22 o formatos con d/m/y
  const estilos = (await leer('xl/styles.xml')) || '';
  const formatosFecha = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const m of estilos.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    if (/[dmy]/i.test(m[2].replace(/"[^"]*"|\[[^\]]*\]/g, ''))) formatosFecha.add(Number(m[1]));
  }
  const xfs = (estilos.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || '');
  const estiloEsFecha = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => formatosFecha.has(Number(m[0].match(/numFmtId="(\d+)"/)?.[1])));

  const hoja = await leer(ruta);
  if (!hoja) throw new Error('No se encontró la primera hoja del Excel');
  const filas = [];
  for (const f of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1];
      const interior = c[2] || '';
      const ref = atributos.match(/\br="([A-Z]+\d+)"/)?.[1];
      const tipo = atributos.match(/\bt="(\w+)"/)?.[1];
      const estilo = Number(atributos.match(/\bs="(\d+)"/)?.[1] ?? -1);
      const v = interior.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoDe(interior);
      else if (tipo === 'b') valor = v === '1' ? 'SI' : 'NO';
      else if (v !== undefined) valor = estiloEsFecha[estilo] && /^\d+(\.\d+)?$/.test(v) ? fechaExcel(v) : desEscapar(v);
      fila[ref ? columna(ref) : fila.length] = String(valor).trim();
    }
    filas.push(Array.from(fila, (x) => x ?? ''));
  }
  return filas.filter((f) => f.some((x) => x !== ''));
}

// CSV con coma o punto y coma (Excel en español suele usar ;)
export function leerCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : primera.includes('\t') ? '\t' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo.trim()); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x !== ''));
}

export async function leerHoja(archivo) {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.xls')) throw new Error('Formato .xls antiguo: ábrelo en Excel y guárdalo como .xlsx o .csv');
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsv(await archivo.text());
  return leerXlsx(await archivo.arrayBuffer());
}

// Encabezados -> campos usando sinónimos. Devuelve { indice: campo }
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function mapearColumnas(encabezados, sinonimos) {
  // Puntaje por columna: coincidencia exacta gana; si no, el sinónimo más largo contenido
  // (así "nombres apoderado" va a apoderado_nombres y no a nombres).
  const candidatos = [];
  encabezados.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const [campo, lista] of Object.entries(sinonimos)) {
      for (const s of lista) {
        const puntos = n === s ? 1000 : s.length > 3 && n.includes(s) ? s.length : 0;
        if (puntos) candidatos.push({ i, campo, puntos });
      }
    }
  });
  candidatos.sort((a, b) => b.puntos - a.puntos);
  const mapa = {};
  const usados = new Set();
  for (const c of candidatos) {
    if (c.i in mapa || usados.has(c.campo)) continue;
    mapa[c.i] = c.campo;
    usados.add(c.campo);
  }
  return mapa;
}

// Normaliza fechas escritas a mano: 30/04/2026, 30-04-26, 2026-04-30
export function fechaIso(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) return fechaExcel(s);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return s;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
