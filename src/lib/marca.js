import { ARCHIVOS } from '../estaticos.generado.js';
// Imagen propia de un colegio guardada como archivo del proyecto (public/colegios/<código>/logo.png o icono.png)
export const imagenFija = (slug, nombre) => ARCHIVOS[`/colegios/${slug}/${nombre}.png`] || null;
// Marca de cada colegio en la app instalada: nombre corto (debajo del ícono) e ícono propio.
const PREFIJOS = /^(i\.?e\.?p?\.?|colegio|institución educativa( privada)?|centro educativo|cebe|c\.e\.)\s+/i;
export const nombreCorto = (c) => {
  const propio = String(c.nombre_corto || '').trim();
  if (propio) return propio.slice(0, 20);
  let n = String(c.nombre || 'Colegio').trim();
  while (PREFIJOS.test(n)) n = n.replace(PREFIJOS, '');
  if (n.length <= 14) return n || 'Colegio';
  const palabras = n.split(/\s+/); let r = '';
  for (const p of palabras) { if ((r + ' ' + p).trim().length > 14) break; r = (r + ' ' + p).trim(); }
  return r || n.slice(0, 14);
};
export const esImagenOk = (s, max) => typeof s === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= max;
export const decodificarImagen = (dataUrl) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  return m ? { tipo: m[1], bytes: Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0)) } : null;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
