// Plantillas del colegio: el mismo diseño (colores, nombre y firma del colegio) para tarjetas de
// cumpleaños, comunicados, constancias, diplomas y reportes. Solo cambian los datos.
// Cada pieza se ve como página web (/c/<token>) y se descarga en PDF (/c/<token>/pdf).
import { DocumentoPdf, ANCHO, ALTO, anchoTexto } from './pdf.js';
import { tokenAleatorio } from './cripto.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colorOk = (c, def) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : def);
export const coloresColegio = (colegio) => ({ p: colorOk(colegio.color_primario, '#1e3a8a'), s: colorOk(colegio.color_secundario, '#f59e0b') });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (iso) => {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  return a ? `${d} de ${MESES[m - 1]} de ${a}` : '';
};

export async function guardarPieza(env, colegioId, tipo, titulo, contenido, creadoPor = null) {
  const token = tokenAleatorio(16);
  const f = await env.DB.prepare('INSERT INTO piezas (colegio_id, tipo, titulo, contenido, token, creado_por) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(colegioId, tipo, String(titulo).slice(0, 150), JSON.stringify(contenido), token, creadoPor).first();
  return { id: f.id, token };
}
export const enlacePieza = (origen, token) => `${origen}/c/${token}`;

// ---------- Página web ----------
export function htmlPieza(pieza, colegio) {
  const { p, s } = coloresColegio(colegio);
  const c = pieza.contenido;
  let cuerpo = '';
  if (pieza.tipo === 'cumple') {
    cuerpo = `<div class="gran">🎂</div><h1>¡Feliz cumpleaños${c.nombre ? `, ${esc(c.nombre)}` : ''}!</h1>
      <p class="msg">${esc(c.mensaje)}</p><div class="globos">🎈 🎉 🎁 🎈</div>`;
  } else if (pieza.tipo === 'diploma') {
    cuerpo = `<p class="peq">Se otorga el presente reconocimiento a</p><h1 class="nom">${esc(c.nombre)}</h1><p class="msg">${esc(c.motivo)}</p>`;
  } else {
    const parrafos = (c.secciones || [{ titulo: '', lineas: String(c.texto || '').split('\n') }]).map((sec) =>
      `${sec.titulo ? `<h2>${esc(sec.titulo)}</h2>` : ''}${(sec.lineas || []).filter((l) => l !== '').map((l) => `<p>${esc(l)}</p>`).join('')}`).join('');
    cuerpo = `<h1>${esc(c.titulo || pieza.titulo)}</h1>${parrafos}`;
  }
  const firma = c.firma ? `<p class="firma">${esc(c.firma)}</p>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(pieza.titulo)} · ${esc(colegio.nombre)}</title>
<style>:root{--p:${p};--s:${s}}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f8;color:#1b2333;line-height:1.55}
.hoja{max-width:640px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 30px rgba(0,0,0,.06)}
.cab{background:var(--p);color:#fff;padding:28px 24px 22px;border-bottom:6px solid var(--s)}.cab b{font-size:1.35rem;display:block}.cab span{opacity:.85;font-size:.9rem}
.cont{padding:28px 24px 36px}h1{color:var(--p);font-size:1.6rem;line-height:1.25;margin:.2em 0 .6em}h2{color:var(--p);font-size:1.1rem;margin:1.4em 0 .3em;border-left:4px solid var(--s);padding-left:10px}
p{margin:.5em 0}.gran{font-size:3.5rem;text-align:center}.cont:has(.gran){text-align:center}.msg{font-size:1.1rem}.globos{font-size:2rem;margin-top:1rem}
.nom{text-align:center;font-size:2rem}.peq{text-align:center;color:#5e6778}.firma{margin-top:2em;color:#5e6778;font-style:italic}
.pie{padding:16px 24px;border-top:1px solid #e4e7ee;color:#5e6778;font-size:.8rem}
.btn{display:inline-block;margin:6px 24px 24px;background:var(--p);color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600}</style></head>
<body><div class="hoja"><div class="cab"><b>${esc(colegio.nombre)}</b><span>${esc(c.fecha ? fechaLarga(c.fecha) : '')}</span></div>
<div class="cont">${cuerpo}${firma}</div>${pieza.tipo === 'cumple' ? '' : `<a class="btn" href="/c/${esc(pieza.token)}/pdf">Descargar en PDF</a>`}
<div class="pie">${esc(colegio.nombre)}${colegio.direccion ? ` · ${esc(colegio.direccion)}` : ''}${colegio.telefono ? ` · ${esc(colegio.telefono)}` : ''}</div></div></body></html>`;
}

// ---------- PDF ----------
export function pdfPieza(pieza, colegio) {
  const { p, s } = coloresColegio(colegio);
  const c = pieza.contenido;
  const doc = new DocumentoPdf({ titulo: pieza.titulo, pie: colegio.nombre, color: p });
  if (pieza.tipo === 'diploma') return pdfDiploma(c, colegio, p, s).bytes();
  doc.banda(colegio.nombre, [colegio.direccion, colegio.telefono].filter(Boolean).join('  ·  '), s);
  if (pieza.tipo === 'constancia') {
    doc.espacio(30);
    doc.texto(ANCHO / 2, doc.y, c.titulo || 'CONSTANCIA', 22, true, p, true);
    doc.rect(ANCHO / 2 - 60, doc.y - 12, 120, 3, s);
    doc.espacio(40);
    for (const l of String(c.texto || '').split('\n')) doc.parrafo(l.trim() === '' ? ' ' : l, { tam: 13, interlineado: 1.7 });
    if (c.firma) { doc.espacio(40); for (const l of String(c.firma).split('\n')) doc.parrafo(l.trim() === '' ? ' ' : l, { tam: 12, negrita: l.trim() === 'Dirección' }); }
    return doc.bytes();
  }
  if (pieza.tipo === 'cumple') {
    doc.titular(`¡Feliz cumpleaños${c.nombre ? `, ${c.nombre}` : ''}!`, 26);
    doc.espacio(10);
    doc.parrafo(c.mensaje, { tam: 14 });
  } else {
    doc.titular(c.titulo || pieza.titulo, 20);
    const secciones = c.secciones || [{ titulo: '', lineas: String(c.texto || '').split('\n') }];
    for (const sec of secciones) {
      if (sec.titulo) { doc.espacio(8); doc.parrafo(sec.titulo, { tam: 13, negrita: true, color: `${hexRgb(p)} rg` }); }
      for (const l of sec.lineas || []) doc.parrafo(l === '' ? ' ' : l, { tam: 11 });
    }
  }
  if (c.firma) { doc.espacio(26); doc.parrafo(c.firma, { tam: 11, negrita: true }); }
  return doc.bytes();
}

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
};

// Texto centrado con ajuste de línea; devuelve la y donde terminó
function centrado(doc, texto, y, { tam = 12, negrita = false, color = '#333333', ancho = 380, interlineado = 1.5 } = {}) {
  let linea = '';
  const volcar = () => { doc.texto(ANCHO / 2, y, linea, tam, negrita, color, true); y -= tam * interlineado; linea = ''; };
  for (const palabra of String(texto || '').split(' ')) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (anchoTexto(prueba, tam, negrita) > ancho && linea) { volcar(); linea = palabra; } else linea = prueba;
  }
  if (linea) volcar();
  return y;
}

function pdfDiploma(c, colegio, p, s) {
  const doc = new DocumentoPdf({ titulo: 'Diploma', pie: '', color: p });
  // Marco: borde secundario grueso, hoja blanca, filete fino del color principal
  doc.rect(24, 24, ANCHO - 48, ALTO - 48, s);
  doc.rect(34, 34, ANCHO - 68, ALTO - 68, '#ffffff');
  doc.rect(44, 44, ANCHO - 88, 1.5, p); doc.rect(44, ALTO - 45.5, ANCHO - 88, 1.5, p);
  doc.rect(44, 44, 1.5, ALTO - 88, p); doc.rect(ANCHO - 45.5, 44, 1.5, ALTO - 88, p);
  // Cabecera con el nombre del colegio
  doc.rect(44, ALTO - 235, ANCHO - 88, 190, p);
  doc.rect(44, ALTO - 241, ANCHO - 88, 6, s);
  let y = centrado(doc, colegio.nombre.toUpperCase(), ALTO - 110, { tam: 22, negrita: true, color: '#ffffff', ancho: 420, interlineado: 1.25 });
  doc.texto(ANCHO / 2, y - 14, '— ✦ —'.replace('✦', '*'), 14, true, s, true);
  doc.texto(ANCHO / 2, ALTO - 205, 'DIPLOMA DE RECONOCIMIENTO', 17, true, '#ffffff', true);
  // Cuerpo
  doc.texto(ANCHO / 2, ALTO - 300, 'Se otorga el presente diploma a', 13, false, '#666666', true);
  y = centrado(doc, c.nombre, ALTO - 360, { tam: 30, negrita: true, color: p, ancho: 440, interlineado: 1.2 });
  doc.rect(ANCHO / 2 - 150, y + 6, 300, 2, s);
  centrado(doc, c.motivo || '', y - 28, { tam: 14, color: '#333333', ancho: 380, interlineado: 1.55 });
  // Fecha y firma
  doc.texto(ANCHO / 2, 190, c.fecha ? fechaLarga(c.fecha) : '', 12, false, '#666666', true);
  doc.rect(ANCHO / 2 - 110, 140, 220, 1, '#444444');
  doc.texto(ANCHO / 2, 124, c.firma || 'Dirección', 12, true, '#444444', true);
  doc.texto(ANCHO / 2, 108, colegio.nombre, 9, false, '#888888', true);
  return doc;
}

export function respuestaPieza(pieza, colegio, parte) {
  if (parte === 'pdf') {
    return new Response(pdfPieza(pieza, colegio), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${pieza.tipo}.pdf"`, 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex' },
    });
  }
  return new Response(htmlPieza(pieza, colegio), {
    headers: {
      'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'private, max-age=300',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
