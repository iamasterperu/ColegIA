// Generador de códigos QR (modo byte, corrección M, versiones 1 a 10). Sin dependencias.
// qrMatriz(texto) → arreglo de filas de booleanos; qrSvg(texto) → texto SVG; qrPng(texto, px) → data URL PNG.
const EC_M = { // [bytes de datos totales, bloques, bytes ECC por bloque]
  1: [16, 1, 10], 2: [28, 1, 16], 3: [44, 1, 26], 4: [64, 2, 18], 5: [86, 2, 24],
  6: [108, 4, 16], 7: [124, 4, 18], 8: [154, 4, 22], 9: [182, 5, 22], 10: [216, 5, 26],
};
const TOTAL = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 }; // palabras de código
const ALINEACION = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const s = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { s[j] ^= c; s[j + 1] ^= mul(c, EXP[i]); });
    g = s;
  }
  return g;
}
function resto(datos, n) {
  const g = generador(n), r = new Array(n).fill(0);
  for (const d of datos) {
    const f = d ^ r.shift(); r.push(0);
    if (f) g.slice(1).forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
}

function bitsFormato(mascara) {
  let d = (0 << 3 | mascara) << 10, r = d; // nivel M = 00
  for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  return ((0 << 3 | mascara) << 10 | r) ^ 0x5412;
}
function bitsVersion(v) {
  let r = v << 12;
  for (let i = 17; i >= 12; i--) if ((r >> i) & 1) r ^= 0x1f25 << (i - 12);
  return v << 12 | r;
}

export function qrMatriz(texto) {
  const bytes = [...new TextEncoder().encode(texto)];
  let v = 1;
  while (v <= 10 && bytes.length > EC_M[v][0] - (v < 10 ? 2 : 3)) v++;
  if (v > 10) throw new Error('Texto demasiado largo para el QR');
  const [capacidad, bloques, ecc] = EC_M[v];
  // Datos: modo byte (0100) + longitud + bytes + terminador + relleno
  const bits = [];
  const poner = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1); };
  poner(4, 4); poner(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => poner(b, 8));
  poner(0, Math.min(4, capacidad * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; datos.length < capacidad; p++) datos.push(p % 2 ? 0x11 : 0xec);
  // Bloques con corrección de errores, entrelazados
  const porBloque = Math.floor(capacidad / bloques), largos = capacidad % bloques;
  const bl = []; let pos = 0;
  for (let i = 0; i < bloques; i++) {
    const n = porBloque + (i >= bloques - largos ? 1 : 0);
    const d = datos.slice(pos, pos + n); pos += n;
    bl.push({ d, e: resto(d, ecc) });
  }
  const final = [];
  for (let i = 0; i < porBloque + 1; i++) bl.forEach((b) => { if (i < b.d.length) final.push(b.d[i]); });
  for (let i = 0; i < ecc; i++) bl.forEach((b) => final.push(b.e[i]));
  const bf = []; final.forEach((c) => { for (let i = 7; i >= 0; i--) bf.push((c >> i) & 1); });
  const resto0 = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 }[v];
  for (let i = 0; i < resto0; i++) bf.push(0);

  const N = 17 + 4 * v;
  const m = Array.from({ length: N }, () => new Array(N).fill(false));
  const fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (x, y, val, f = true) => { if (x >= 0 && y >= 0 && x < N && y < N) { m[y][x] = val; if (f) fn[y][x] = true; } };
  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  buscador(3, 3); buscador(N - 4, 3); buscador(3, N - 4);
  for (let i = 8; i < N - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
  const al = ALINEACION[v];
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === N - 7) || (cx === N - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  set(8, N - 8, true); // módulo oscuro
  const dibujarFormato = (mascara) => {
    const f = bitsFormato(mascara), b = (i) => ((f >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(N - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, N - 15 + i, b(i));
    set(8, N - 8, true);
  };
  dibujarFormato(0);
  if (v >= 7) {
    const vb = bitsVersion(v);
    for (let i = 0; i < 18; i++) {
      const bit = ((vb >> i) & 1) === 1, a = N - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, bit); set(c, a, bit);
    }
  }
  // Colocar datos en zigzag
  const lugares = [];
  for (let derecha = N - 1, arriba = true; derecha >= 1; derecha -= 2, arriba = !arriba) {
    if (derecha === 6) derecha = 5;
    for (let k = 0; k < N; k++) {
      const y = arriba ? N - 1 - k : k;
      for (const x of [derecha, derecha - 1]) if (!fn[y][x]) lugares.push([x, y]);
    }
  }
  lugares.forEach(([x, y], i) => { m[y][x] = i < bf.length ? bf[i] === 1 : false; });

  const reglas = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const penalizacion = (g) => {
    let p = 0;
    for (let y = 0; y < N; y++) {
      for (const filas of [true, false]) {
        let corrida = 1;
        for (let i = 1; i < N; i++) {
          const a = filas ? g[y][i] : g[i][y], b = filas ? g[y][i - 1] : g[i - 1][y];
          if (a === b) { corrida++; if (corrida === 5) p += 3; else if (corrida > 5) p++; } else corrida = 1;
        }
      }
    }
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
    const patron = [true, false, true, true, true, false, true, false, false, false, false];
    const inv = [...patron].reverse();
    for (let y = 0; y < N; y++) for (let x = 0; x <= N - 11; x++) {
      for (const pt of [patron, inv]) {
        if (pt.every((val, i) => g[y][x + i] === val)) p += 40;
        if (pt.every((val, i) => g[x + i][y] === val)) p += 40;
      }
    }
    const negros = g.flat().filter(Boolean).length;
    p += Math.floor(Math.abs((negros * 100) / (N * N) - 50) / 5) * 10;
    return p;
  };
  let mejor = null, mejorP = Infinity, mejorM = 0;
  for (let mk = 0; mk < 8; mk++) {
    const g = m.map((fila, y) => fila.map((val, x) => (fn[y][x] ? val : val !== reglas[mk](x, y))));
    // el formato depende de la máscara
    const tmp = g;
    const fm = bitsFormato(mk), b = (i) => ((fm >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) tmp[i][8] = b(i);
    tmp[7][8] = b(6); tmp[8][8] = b(7); tmp[8][7] = b(8);
    for (let i = 9; i < 15; i++) tmp[8][14 - i] = b(i);
    for (let i = 0; i < 8; i++) tmp[8][N - 1 - i] = b(i);
    for (let i = 8; i < 15; i++) tmp[N - 15 + i][8] = b(i);
    tmp[N - 8][8] = true;
    const p = penalizacion(tmp);
    if (p < mejorP) { mejorP = p; mejor = tmp; mejorM = mk; }
  }
  void mejorM;
  return mejor;
}

export function qrSvg(texto, { escala = 8, margen = 4, color = '#000', fondo = '#fff' } = {}) {
  const m = qrMatriz(texto), n = m.length, t = (n + margen * 2) * escala;
  let d = '';
  m.forEach((fila, y) => fila.forEach((v, x) => { if (v) d += `M${(x + margen) * escala} ${(y + margen) * escala}h${escala}v${escala}h-${escala}z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${t}" height="${t}"><rect width="100%" height="100%" fill="${fondo}"/><path d="${d}" fill="${color}"/></svg>`;
}

export function qrPng(texto, px = 512, { margen = 4 } = {}) {
  const m = qrMatriz(texto), n = m.length + margen * 2, esc = Math.max(1, Math.floor(px / n));
  const c = document.createElement('canvas'); c.width = c.height = n * esc;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  m.forEach((fila, y) => fila.forEach((v, x) => { if (v) g.fillRect((x + margen) * esc, (y + margen) * esc, esc, esc); }));
  return c.toDataURL('image/png');
}
