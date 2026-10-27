// Generador de PDF mínimo (A4, Helvetica, acentos en WinAnsi). Sin librerías: los
// exámenes y sesiones se arman en milisegundos dentro del límite del plan gratis.
const ANCHO = 595;
const ALTO = 842;
const MARGEN = 50;

const ESPECIALES = { '–': 0x96, '—': 0x97, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '…': 0x85, '€': 0x80 };

// Texto a bytes WinAnsi (un carácter = un byte); lo que no existe en la fuente se quita
function winAnsi(texto) {
  let s = '';
  for (const c of String(texto ?? '').normalize('NFC')) {
    const code = c.codePointAt(0);
    if (ESPECIALES[c]) s += String.fromCharCode(ESPECIALES[c]);
    else if (code < 256 && code >= 32) s += c;
    else if (code === 9) s += ' ';
  }
  return s;
}

const escapar = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

function anchoTexto(texto, tam, negrita) {
  let w = 0;
  for (const c of texto) {
    if ('il.,;:\'|!jtfI'.includes(c)) w += 0.28;
    else if ('mwMW@'.includes(c)) w += 0.82;
    else if (c >= 'A' && c <= 'Z') w += 0.66;
    else if (c === ' ') w += 0.28;
    else w += 0.53;
  }
  return w * tam * (negrita ? 1.06 : 1);
}

const hexARgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x1e3a8a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
};

export class DocumentoPdf {
  constructor({ titulo = '', pie = '', color = '#1e3a8a' } = {}) {
    this.paginas = [];
    this.titulo = titulo;
    this.pie = pie;
    this.color = hexARgb(color);
    this.nuevaPagina();
  }

  nuevaPagina() {
    this.ops = [];
    this.paginas.push(this.ops);
    this.y = ALTO - MARGEN;
    // franja de color del colegio
    this.ops.push(`${this.color} rg 0 ${ALTO - 14} ${ANCHO} 14 re f 0 g`);
    if (this.pie) this.escribir(MARGEN, 28, `${this.pie} · página ${this.paginas.length}`, 8, false, '0.45 g');
  }

  escribir(x, y, texto, tam, negrita, color = '0 g') {
    this.ops.push(`BT ${color} /${negrita ? 'F2' : 'F1'} ${tam} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapar(winAnsi(texto))}) Tj ET`);
  }

  espacio(alto = 8) {
    this.y -= alto;
  }

  // Párrafo con ajuste de línea y salto de página automático
  parrafo(texto, { tam = 11, negrita = false, sangria = 0, color = '0 g', interlineado = 1.35 } = {}) {
    const ancho = ANCHO - MARGEN * 2 - sangria;
    for (const bloque of String(texto ?? '').split('\n')) {
      const palabras = winAnsi(bloque).split(' ');
      let linea = '';
      // this.y es el borde superior de la línea: se baja el tamaño de letra y se escribe en la base
      const volcar = () => {
        if (this.y - tam < MARGEN + 30) this.nuevaPagina();
        this.y -= tam;
        this.escribir(MARGEN + sangria, this.y, linea, tam, negrita, color);
        this.y -= tam * (interlineado - 1);
        linea = '';
      };
      for (const p of palabras) {
        const prueba = linea ? `${linea} ${p}` : p;
        if (anchoTexto(prueba, tam, negrita) > ancho && linea) {
          volcar();
          linea = p;
        } else linea = prueba;
      }
      volcar();
    }
  }

  titular(texto, tam = 18) {
    this.parrafo(texto, { tam, negrita: true });
    this.espacio(4);
  }

  linea() {
    this.ops.push(`0.8 G 0.7 w ${MARGEN} ${this.y + 4} m ${ANCHO - MARGEN} ${this.y + 4} l S 0 G`);
    this.espacio(8);
  }

  // Asegura espacio para un bloque (pregunta con opciones) sin partirlo
  reservar(alto) {
    if (this.y - alto < MARGEN + 30) this.nuevaPagina();
  }

  bytes() {
    const objetos = [];
    const agregar = (contenido) => objetos.push(contenido) && objetos.length;
    const catalogo = agregar('');
    const paginasId = agregar('');
    const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.paginas) {
      const flujo = ops.join('\n');
      const contenido = agregar(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
      kids.push(agregar(`<< /Type /Page /Parent ${paginasId} 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contenido} 0 R >>`));
    }
    objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasId} 0 R >>`;
    objetos[paginasId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objetos.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info << /Title (${escapar(winAnsi(this.titulo))}) /Producer (ColegIA) >> >>\nstartxref\n${xref}\n%%EOF`;
    const salida = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) salida[i] = pdf.charCodeAt(i) & 255;
    return salida;
  }
}
