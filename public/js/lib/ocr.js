// Foto de la lista de útiles -> texto -> ítems. El reconocimiento (Tesseract.js) corre
// en el navegador: la foto nunca se sube al servidor, solo los ítems ya revisados.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function cargarScript(src) {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = ok;
    s.onerror = () => mal(new Error('No se pudo cargar el lector de fotos. Revisa tu conexión.'));
    document.head.append(s);
  });
}

// Reduce la foto, la pasa a grises y sube el contraste: mejora mucho la lectura de fotos de celular
export async function prepararImagen(archivo, maximo = 1800) {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, maximo / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gris = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (gris - 128) * 1.6 + 140));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return lienzo;
}

export async function leerFoto(archivo, alProgresar = () => {}) {
  await cargarScript(TESSERACT);
  const lienzo = await prepararImagen(archivo);
  const trabajador = await window.Tesseract.createWorker('spa', 1, {
    logger: (m) => m.status === 'recognizing text' && alProgresar(m.progress),
  });
  try {
    const { data } = await trabajador.recognize(lienzo);
    return data.text;
  } finally {
    await trabajador.terminate();
  }
}

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, docena: 12, quince: 15, veinte: 20,
};
const ENCABEZADO = /\b(lista de utiles|utiles escolares|colegio|grado|nivel|seccion|ano escolar|año escolar|tutor|nota:|importante|observacion)/i;
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Convierte el texto de la foto en ítems { cantidad, descripcion, detalle, dudoso }.
 * Reglas: quita viñetas y numeración, toma la cantidad del inicio ("2", "02", "dos",
 * "1/2 docena") y el texto entre paréntesis como detalle. Marca como dudosas las líneas
 * cortas o con símbolos raros para que la secretaria las revise.
 */
export function parsearListaUtiles(texto) {
  const items = [];
  for (const linea of String(texto).split(/\r?\n/)) {
    let l = linea.replace(/[|_~`´]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!l) continue;
    if (ENCABEZADO.test(sinTildes(l)) && !/^\W*\d/.test(l)) continue;
    l = l.replace(/^[-–—*•·°o>+]+\s*/, '');
    // "1. 2 cuadernos" o "1) cuaderno": numeración de la lista, no cantidad
    l = l.replace(/^\d{1,2}\s*[.)]\s+(?=\S)/, '');
    let cantidad = '';
    const m = l.match(/^(media docena|1\/2 docena|\d{1,3}(?:[.,/]\d+)?|[a-záéíóúñ]+)\b\.?\s*(?:x\s*)?(.*)$/i);
    if (m) {
      const n = sinTildes(m[1].toLowerCase());
      if (/^\d/.test(n)) { cantidad = String(Number(n.replace(',', '.')) || n).replace(/^0+(?=\d)/, ''); l = m[2]; }
      else if (n === 'media docena' || n === '1/2 docena') { cantidad = '6'; l = m[2]; }
      else if (NUMEROS[n]) { cantidad = String(NUMEROS[n]); l = m[2]; }
    }
    let detalle = '';
    const par = l.match(/\(([^)]*)\)\s*$/);
    if (par) { detalle = par[1].trim(); l = l.slice(0, par.index).trim(); }
    l = l.replace(/^de\s+/i, '').replace(/[.;,:]+$/, '').trim();
    if (!l) continue;
    const letras = (l.match(/[a-záéíóúñ]/gi) || []).length;
    if (letras < 3) continue;
    const dudoso = letras / l.length < 0.6 || l.length < 5 || !cantidad;
    items.push({ cantidad, descripcion: l.charAt(0).toUpperCase() + l.slice(1), detalle, dudoso });
  }
  return items;
}
