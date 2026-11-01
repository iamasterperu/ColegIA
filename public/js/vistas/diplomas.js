// Diplomas con el diseño del propio colegio: se sube el PDF sin nombre una vez, se marca dónde va el
// nombre y el navegador arma un diploma por alumno (un PDF con todos o un ZIP). Nada sale del colegio.
import { api } from '../api.js';
import { html, crudo, $, aviso, conBoton } from '../ui.js';

const ESTILOS = { elegante: 'Elegante (cursiva)', moderno: 'Moderno (negrita)', clasico: 'Clásico (serif)' };
const MAX = 1_400_000;

let cargaLib;
const cargarPdfLib = () => cargaLib || (cargaLib = new Promise((ok, mal) => {
  if (window.PDFLib) return ok(window.PDFLib);
  const s = document.createElement('script');
  s.src = '/js/vendor/pdf-lib.min.js';
  s.onload = () => ok(window.PDFLib);
  s.onerror = () => { cargaLib = null; mal(new Error('No se pudo cargar el generador de PDF')); };
  document.head.append(s);
}));

const aBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const deHex = (h, PDFLib) => { const n = parseInt(h.slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
export const bonito = (t) => String(t || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s+/g, ' ').trim();
const nombreArchivo = (t) => String(t).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'diploma';

// Escribe el nombre centrado sobre la primera página del diploma del colegio
async function escribirNombre(PDFLib, doc, pagina, nombre, cfg) {
  const fuente = await doc.embedFont({ elegante: PDFLib.StandardFonts.TimesRomanBoldItalic, moderno: PDFLib.StandardFonts.HelveticaBold, clasico: PDFLib.StandardFonts.TimesRomanBold }[cfg.estilo] || PDFLib.StandardFonts.TimesRomanBoldItalic);
  const { width, height } = pagina.getSize();
  let tam = cfg.tam;
  const maxAncho = width * 0.86;
  while (tam > 8 && fuente.widthOfTextAtSize(nombre, tam) > maxAncho) tam -= 1;
  const w = fuente.widthOfTextAtSize(nombre, tam);
  pagina.drawText(nombre, { x: (width * cfg.x) / 100 - w / 2, y: height * (1 - cfg.y / 100) - tam * 0.3, size: tam, font: fuente, color: deHex(cfg.color, PDFLib) });
}

export async function diplomaUno(PDFLib, base, nombre, cfg) {
  const doc = await PDFLib.PDFDocument.load(base);
  await escribirNombre(PDFLib, doc, doc.getPage(0), nombre, cfg);
  return doc.save();
}
export async function diplomaTodos(PDFLib, base, nombres, cfg) {
  const salida = await PDFLib.PDFDocument.create();
  const origen = await PDFLib.PDFDocument.load(base);
  for (const n of nombres) {
    const [p] = await salida.copyPages(origen, [0]);
    salida.addPage(p);
    await escribirNombre(PDFLib, salida, p, n, cfg);
  }
  return salida.save();
}

// ZIP sin compresión (los PDF ya vienen comprimidos)
const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function crearZip(archivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let pos = 0;
  for (const { nombre, datos } of archivos) {
    const n = enc.encode(nombre), crc = crc32(datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true); loc.setUint16(26, n.length, true);
    partes.push(new Uint8Array(loc.buffer), n, datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, n.length, true); cen.setUint32(42, pos, true);
    central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tamCentral, true); fin.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}
const bajar = (blob, nombre) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export const seccionDiplomas = () => html`<section class="tarjeta" id="dip"><h2>🏅 Diplomas con el diseño de tu colegio</h2>
  <p class="pequeno">Sube el PDF de tu diploma <strong>sin el nombre del alumno</strong>, marca dónde va el nombre y ColegIA escribe el de todos los alumnos del aula (o del colegio) automáticamente. Lo descargas en un solo PDF para imprimir o en un ZIP con un diploma por alumno. Todo se arma en tu computadora: el diploma no sale del colegio.</p>
  <div id="dip-cont" class="pequeno">Cargando…</div></section>`;

export async function activarDiplomas(vista) {
  const cont = $('#dip-cont', vista);
  const { plantilla } = await api.get('/api/diplomas/plantilla');
  let base = null;
  const cfg = plantilla ? { x: plantilla.x_pct, y: plantilla.y_pct, tam: plantilla.tam, color: plantilla.color, estilo: plantilla.estilo } : { x: 50, y: 50, tam: 32, color: '#1e3a8a', estilo: 'elegante' };
  let nuevo = null; // { nombre, b64, bytes } si se está subiendo un PDF nuevo
  let url = null;

  const bytesBase = async () => {
    if (nuevo) return nuevo.bytes;
    if (base) return base;
    const r = await fetch('/api/diplomas/plantilla/archivo', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('No se pudo leer tu diploma guardado');
    base = new Uint8Array(await r.arrayBuffer());
    return base;
  };
  const vistaPrevia = async () => {
    const marco = $('#dip-prev', vista);
    if (!marco || (!plantilla && !nuevo)) return;
    try {
      const PDFLib = await cargarPdfLib();
      const bytes = await diplomaUno(PDFLib, await bytesBase(), 'María Fernanda Quispe Huamán', cfg);
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      marco.src = `${url}#toolbar=0&navpanes=0`;
    } catch (e) { aviso(e.message, 'error'); }
  };

  const pintar = async () => {
    const hay = plantilla || nuevo;
    let alumnos = [];
    if (hay) alumnos = (await api.get('/api/diplomas/alumnos')).alumnos;
    const aulas = [...new Set(alumnos.map((a) => `${a.grado}|${a.seccion}`))];
    cont.innerHTML = html`
      <label class="btn" style="cursor:pointer">📄 ${hay ? 'Cambiar el PDF de mi diploma' : 'Subir el PDF de mi diploma (sin nombre)'}<input type="file" id="dip-pdf" accept="application/pdf" style="position:absolute;opacity:0;width:1px;height:1px"></label>
      <span class="pequeno"> ${nuevo ? nuevo.nombre : plantilla ? plantilla.nombre_archivo : 'PDF de hasta 1,4 MB. Si pesa más, expórtalo de nuevo con menos calidad de imagen.'}</span>
      ${hay ? html`
      <h3>1. Marca dónde va el nombre</h3>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:14px;align-items:start">
        <div class="form" style="gap:8px">
          <label>Posición horizontal <input type="range" id="dip-x" min="5" max="95" step="0.5" value="${cfg.x}"></label>
          <label>Posición vertical <input type="range" id="dip-y" min="5" max="95" step="0.5" value="${cfg.y}"></label>
          <label>Tamaño de letra <input type="range" id="dip-tam" min="14" max="72" value="${cfg.tam}"></label>
          <label>Color <input type="color" id="dip-color" value="${cfg.color}"></label>
          <label>Tipo de letra <select id="dip-estilo">${Object.entries(ESTILOS).map(([k, t]) => html`<option value="${k}" ${k === cfg.estilo ? crudo('selected') : ''}>${t}</option>`)}</select></label>
          <button class="btn btn-primario" id="dip-guardar">${nuevo ? 'Guardar mi diploma y la posición' : 'Guardar posición'}</button>
          ${plantilla && !nuevo ? html`<button class="btn" id="dip-quitar">Quitar mi diploma</button>` : ''}
        </div>
        <iframe id="dip-prev" title="Vista previa" style="width:100%;height:420px;border:1px solid #d6dae3;border-radius:8px;background:#f4f5f8"></iframe>
      </div>
      <p class="pequeno">La vista previa usa un nombre de ejemplo largo. Si un nombre no cabe, la letra se achica sola.</p>
      <h3>2. Descarga los diplomas</h3>
      ${plantilla && !nuevo ? html`
        <div class="form" style="gap:8px"><label>¿De quién?<select id="dip-aula"><option value="">Todo el colegio (${alumnos.length} alumnos)</option>${aulas.map((k) => { const [g, s] = k.split('|'); const n = alumnos.filter((a) => a.grado === g && a.seccion === s).length; return html`<option value="${k}">${g} ${s} (${n})</option>`; })}</select></label>
          <div><button class="btn btn-primario" id="dip-pdfunico">Un solo PDF para imprimir</button> <button class="btn" id="dip-zip">ZIP: un diploma por alumno</button></div>
          <p class="pequeno" id="dip-estado"></p></div>` : html`<p class="pequeno">Guarda primero tu diploma para poder descargar.</p>`}` : ''}`.toString();

    $('#dip-pdf', vista).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > MAX) return aviso('Ese PDF pesa más de 1,4 MB. Expórtalo de nuevo con menos calidad de imagen.', 'error');
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return aviso('Ese archivo no es un PDF', 'error');
      nuevo = { nombre: f.name, bytes, b64: aBase64(bytes) };
      await pintar();
    });
    if (!hay) return;
    const leer = () => { cfg.x = Number($('#dip-x', vista).value); cfg.y = Number($('#dip-y', vista).value); cfg.tam = Number($('#dip-tam', vista).value); cfg.color = $('#dip-color', vista).value; cfg.estilo = $('#dip-estilo', vista).value; };
    let t;
    ['#dip-x', '#dip-y', '#dip-tam', '#dip-color', '#dip-estilo'].forEach((s) => $(s, vista).addEventListener('input', () => { leer(); clearTimeout(t); t = setTimeout(vistaPrevia, 250); }));
    $('#dip-guardar', vista).addEventListener('click', (e) => conBoton(e.target, async () => {
      leer();
      await api.put('/api/diplomas/plantilla', { x_pct: cfg.x, y_pct: cfg.y, tam: cfg.tam, color: cfg.color, estilo: cfg.estilo, ...(nuevo ? { pdf_base64: nuevo.b64, nombre_archivo: nuevo.nombre } : {}) });
      aviso('Tu diploma quedó guardado');
      location.reload();
    }));
    $('#dip-quitar', vista)?.addEventListener('click', async () => {
      if (!window.confirm('¿Quitar tu diploma guardado?')) return;
      await api.del('/api/diplomas/plantilla'); location.reload();
    });
    if (plantilla && !nuevo) {
      const generar = async (zip, boton) => conBoton(boton, async () => {
        const sel = $('#dip-aula', vista).value;
        const lista = alumnos.filter((a) => !sel || `${a.grado}|${a.seccion}` === sel);
        if (!lista.length) return aviso('No hay alumnos en esa aula', 'error');
        const estado = $('#dip-estado', vista);
        estado.textContent = `Preparando ${lista.length} diplomas…`;
        const PDFLib = await cargarPdfLib();
        const bytes = await bytesBase();
        const nombres = lista.map((a) => bonito(`${a.nombres} ${a.apellidos}`));
        const etiqueta = sel ? sel.replace('|', ' ') : 'colegio';
        if (zip) {
          const archivos = [];
          for (let i = 0; i < lista.length; i++) {
            archivos.push({ nombre: `${nombreArchivo(`${i + 1} ${bonito(`${lista[i].apellidos} ${lista[i].nombres}`)}`)}.pdf`, datos: await diplomaUno(PDFLib, bytes, nombres[i], cfg) });
            if (i % 5 === 0) estado.textContent = `Preparando diplomas… ${i + 1}/${lista.length}`;
          }
          bajar(crearZip(archivos), `Diplomas ${nombreArchivo(etiqueta)}.zip`);
        } else {
          bajar(new Blob([await diplomaTodos(PDFLib, bytes, nombres, cfg)], { type: 'application/pdf' }), `Diplomas ${nombreArchivo(etiqueta)}.pdf`);
        }
        estado.textContent = `✅ Listo: ${lista.length} diplomas.`;
      });
      $('#dip-pdfunico', vista).addEventListener('click', (e) => generar(false, e.target));
      $('#dip-zip', vista).addEventListener('click', (e) => generar(true, e.target));
    }
    await vistaPrevia();
  };
  await pintar();
}
