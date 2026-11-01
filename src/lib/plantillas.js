// Plantillas del colegio: el mismo diseño (colores, nombre y firma del colegio) para tarjetas de
// cumpleaños, comunicados, constancias, diplomas y reportes. Solo cambian los datos.
// Cada pieza se ve como página web (/c/<token>) y se descarga en PDF (/c/<token>/pdf).
import { DocumentoPdf, ANCHO, ALTO, anchoTexto } from './pdf.js';
import { tokenAleatorio } from './cripto.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colorOk = (c, def) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : def);
export const coloresColegio = (colegio) => ({ p: colorOk(colegio.color_primario, '#1e3a8a'), s: colorOk(colegio.color_secundario, '#f59e0b') });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
// Mezcla un color con blanco (f = cuánto blanco, 0 a 1) para fondos suaves del color del colegio
export const tinte = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const m = (v) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
  return `#${m((n >> 16) & 255)}${m((n >> 8) & 255)}${m(n & 255)}`;
};
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
  if (pieza.tipo === 'cumple') return htmlCumple(pieza, colegio, p, s);
  if (c.diseno === 'carta') return htmlCarta(pieza, colegio, p, s);
  let cuerpo = '';
  if (pieza.tipo === 'diploma') {
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

// ---------- Tarjeta de cumpleaños (globos y confeti en los colores del colegio) ----------
function globo(x, y, k, color, giro = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${giro}) scale(${k})"><path d="M0 62 C-4 90 6 110 0 140" stroke="#9aa3b2" stroke-width="1.6" fill="none"/>
    <path d="M-7 70 L0 58 L7 70 Z" fill="${color}"/><ellipse cx="0" cy="0" rx="46" ry="58" fill="${color}"/>
    <ellipse cx="0" cy="0" rx="46" ry="58" fill="url(#brillo)"/><ellipse cx="-17" cy="-24" rx="9" ry="16" fill="#fff" opacity=".4" transform="rotate(25 -17 -24)"/></g>`;
}
function confeti(colores, n = 46) {
  let semilla = 7;
  const al = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  let o = '';
  for (let i = 0; i < n; i++) {
    const x = al() * 600, y = al() * 600, c = colores[Math.floor(al() * colores.length)], g = Math.round(al() * 180), t = 5 + al() * 9;
    o += al() > 0.45 ? `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${t.toFixed(0)}" height="${(t * 0.45).toFixed(0)}" fill="${c}" opacity=".55" transform="rotate(${g} ${x.toFixed(0)} ${y.toFixed(0)})"/>`
      : `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(t * 0.35).toFixed(1)}" fill="${c}" opacity=".5"/>`;
  }
  return o;
}
function htmlCumple(pieza, colegio, p, s) {
  const c = pieza.contenido;
  const plata = '#cfd5df';
  const logo = /^data:image\/(png|jpeg|webp);base64,/.test(colegio.logo || '') ? `<img class="logo" alt="" src="${esc(colegio.logo)}">` : '';
  const fondo = `<svg class="fx" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="brillo" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient></defs>
    ${confeti([s, tinte(s, 0.35), p, tinte(p, 0.5), '#e9c46a'])}
    ${globo(-6, 470, 1.15, p, -8)}${globo(48, 548, 0.95, plata, 6)}${globo(112, 585, 0.8, p, -4)}${globo(-10, 360, 0.9, plata, 10)}
    ${globo(606, 455, 1.2, plata, 8)}${globo(552, 556, 1, p, -6)}${globo(486, 590, 0.75, s, 5)}${globo(610, 340, 0.85, p, -10)}${globo(306, 600, 0.7, tinte(p, 0.25), 0)}</svg>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Feliz cumpleaños · ${esc(colegio.nombre)}</title>
<style>:root{--p:${p};--s:${s}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eceff5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.tarjeta{position:relative;width:min(100vw,560px);aspect-ratio:1/1;background:radial-gradient(circle at 50% 35%,#fff,#f1f3f8);overflow:hidden;container-type:inline-size;box-shadow:0 10px 40px rgba(20,30,60,.15)}
.fx{position:absolute;inset:0;width:100%;height:100%}.txt{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:7cqw 9cqw 0;height:100%}
.logo{max-height:14cqw;max-width:50cqw;object-fit:contain;margin-bottom:2cqw}.cole{color:var(--p);font-weight:800;font-size:5cqw;letter-spacing:.02em;text-transform:uppercase}
.feliz{margin:4cqw 0 0;color:var(--p);font-size:9.6cqw;line-height:1;font-weight:900;font-style:italic;letter-spacing:-.02em}.nom{margin:1.2cqw 0 0;color:var(--s);font-size:11cqw;line-height:1.05;font-weight:900;text-shadow:0 1px 0 rgba(0,0,0,.08)}
.nom small{display:block}.msg{margin:4.5cqw 0 0;color:var(--p);font-size:3.9cqw;line-height:1.45;max-width:82cqw}.firma{margin-top:3.5cqw;color:var(--p);font-weight:700;font-size:3.9cqw}
.pie{position:absolute;left:0;right:0;bottom:3cqw;text-align:center;color:var(--p);font-size:2.7cqw;opacity:.85}</style></head>
<body><div class="tarjeta">${fondo}<div class="txt">${logo}<div class="cole">${esc(colegio.nombre)}</div>
<h1 class="feliz">¡Feliz cumpleaños!</h1>${c.nombre ? `<div class="nom">${esc(c.nombre)}</div>` : ''}
<p class="msg">${esc(c.mensaje)}</p><div class="firma">${esc(c.firma || `Con cariño, ${colegio.nombre}`)}</div></div></div></body></html>`;
}

// ---------- Carta de presentación (diseño con color del colegio) ----------
function htmlCarta(pieza, colegio, p, s) {
  const c = pieza.contenido;
  const secs = c.secciones || [];
  const intro = secs[0];
  const logo = /^data:image\/(png|jpeg|webp);base64,/.test(colegio.logo || '') ? `<img class="logo" alt="" src="${esc(colegio.logo)}">` : '';
  const bloques = secs.slice(1).map((sec) => `<section class="bl"><h2>${esc(sec.titulo)}</h2>${(sec.lineas || []).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(pieza.titulo)} · ${esc(colegio.nombre)}</title>
<style>:root{--p:${p};--s:${s};--t:${tinte(p, 0.92)};--ts:${tinte(s, 0.85)}}*{box-sizing:border-box}body{margin:0;background:#eef0f5;color:#1b2333;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6}
.hoja{max-width:680px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 30px rgba(0,0,0,.07);overflow:hidden}
.hero{position:relative;background:var(--p);color:#fff;padding:44px 28px 54px;overflow:hidden}.hero:before,.hero:after{content:"";position:absolute;border-radius:50%}
.hero:before{width:240px;height:240px;right:-70px;top:-90px;background:var(--s);opacity:.9}.hero:after{width:150px;height:150px;right:70px;bottom:-85px;background:#fff;opacity:.12}
.hero>*{position:relative}.logo{max-height:64px;max-width:200px;object-fit:contain;display:block;margin-bottom:14px;background:#fff;border-radius:10px;padding:6px}
.hero small{display:block;letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;opacity:.85}.hero h1{margin:6px 0 4px;font-size:1.9rem;line-height:1.2}.hero p{margin:0;opacity:.9}
.franja{height:7px;background:var(--s)}.cont{padding:26px 24px 8px}.intro{background:var(--t);border-left:6px solid var(--s);border-radius:0 14px 14px 0;padding:16px 20px;margin-bottom:22px}
.intro h2{margin:0 0 6px;color:var(--p);font-size:1.25rem}.intro p{margin:.4em 0}
.bl{margin:0 0 16px;border:1px solid #e3e7ef;border-radius:14px;overflow:hidden}.bl h2{margin:0;background:var(--t);color:var(--p);font-size:1rem;padding:10px 16px 10px 14px;border-left:6px solid var(--s)}
.bl p{margin:0;padding:7px 16px;position:relative;padding-left:30px}.bl p:before{content:"";position:absolute;left:16px;top:17px;width:7px;height:7px;border-radius:50%;background:var(--s)}.bl h2+p{margin-top:6px}.bl p:last-child{padding-bottom:12px}
.firma{margin:8px 24px 22px;color:var(--p);font-weight:700}.pie{background:var(--p);color:#fff;padding:16px 24px;font-size:.85rem}
.btn{display:inline-block;margin:0 24px 22px;background:var(--s);color:#1b2333;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700}</style></head>
<body><div class="hoja"><div class="hero">${logo}<small>Carta de presentación</small><h1>${esc(colegio.nombre)}</h1><p>Para las familias que nos visitan</p></div><div class="franja"></div>
<div class="cont">${intro ? `<div class="intro"><h2>${esc(intro.titulo)}</h2>${(intro.lineas || []).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}${bloques}</div>
<p class="firma">${esc(c.firma || '')}</p><a class="btn" href="/c/${esc(pieza.token)}/pdf">Descargar en PDF</a>
<div class="pie">${esc(colegio.nombre)}${colegio.direccion ? ` · ${esc(colegio.direccion)}` : ''}${colegio.telefono ? ` · ${esc(colegio.telefono)}` : ''}</div></div></body></html>`;
}

function pdfCarta(c, colegio, p, s) {
  const doc = new DocumentoPdf({ titulo: c.titulo || 'Carta de presentación', pie: colegio.nombre, color: p });
  doc.rect(0, ALTO - 190, ANCHO, 190, p);
  doc.circulo(ANCHO - 40, ALTO - 35, 120, s); doc.circulo(ANCHO - 175, ALTO - 170, 50, tinte(p, 0.25));
  doc.rect(0, ALTO - 197, ANCHO, 7, s);
  doc.texto(50, ALTO - 70, 'CARTA DE PRESENTACIÓN', 10, true, tinte(p, 0.8));
  let y = centradoIzq(doc, colegio.nombre, ALTO - 104, { tam: 26, negrita: true, color: '#ffffff', ancho: 400 });
  doc.texto(50, y - 4, 'Para las familias que nos visitan', 13, false, '#ffffff');
  doc.y = ALTO - 197 - 30;
  const [intro, ...resto] = c.secciones || [];
  if (intro) {
    const lineas = (intro.lineas || []).filter(Boolean);
    const alto = 34 + lineas.reduce((n, l) => n + Math.ceil(anchoTexto(l, 12, false) / 440) * 17 + 6, 0);
    doc.rect(50, doc.y - alto, ANCHO - 100, alto, tinte(p, 0.92));
    doc.rect(50, doc.y - alto, 6, alto, s);
    doc.espacio(10);
    doc.parrafo(intro.titulo, { tam: 14, negrita: true, sangria: 22, color: `${hexColor(p)} rg` });
    for (const l of lineas) doc.parrafo(l, { tam: 12, sangria: 22, interlineado: 1.4 });
    doc.espacio(26);
  }
  for (const sec of resto) {
    const lineas = (sec.lineas || []).filter(Boolean);
    doc.reservar(40 + Math.min(lineas.length, 2) * 16);
    doc.rect(50, doc.y - 24, ANCHO - 100, 24, tinte(p, 0.92));
    doc.rect(50, doc.y - 24, 6, 24, s);
    doc.texto(66, doc.y - 16.5, sec.titulo, 12.5, true, p);
    doc.espacio(32);
    for (const l of lineas) {
      doc.reservar(24);
      doc.circulo(64, doc.y - 8, 2.6, s);
      doc.parrafo(l, { tam: 11, sangria: 24, interlineado: 1.4 });
    }
    doc.espacio(14);
  }
  if (c.firma) { doc.reservar(40); doc.espacio(6); doc.parrafo(c.firma, { tam: 12, negrita: true, color: `${hexColor(p)} rg` }); }
  return doc;
}
const hexColor = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
// Texto alineado a la izquierda con ajuste de línea; devuelve la y donde terminó
function centradoIzq(doc, texto, y, { tam = 12, negrita = false, color = '#333333', ancho = 380, x = 50 } = {}) {
  let linea = '';
  const volcar = () => { doc.texto(x, y, linea, tam, negrita, color); y -= tam * 1.25; linea = ''; };
  for (const palabra of String(texto || '').split(' ')) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (anchoTexto(prueba, tam, negrita) > ancho && linea) { volcar(); linea = palabra; } else linea = prueba;
  }
  if (linea) volcar();
  return y;
}

// ---------- PDF ----------
export function pdfPieza(pieza, colegio) {
  const { p, s } = coloresColegio(colegio);
  const c = pieza.contenido;
  const doc = new DocumentoPdf({ titulo: pieza.titulo, pie: colegio.nombre, color: p });
  if (pieza.tipo === 'diploma') return pdfDiploma(c, colegio, p, s).bytes();
  if (c.diseno === 'carta') return pdfCarta(c, colegio, p, s).bytes();
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
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
