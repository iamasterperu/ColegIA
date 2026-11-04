// Página pública de un colegio: botones para hablar con el colegio o instalar su chat, y su QR.
import { qrSvg } from './qr.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (location.pathname.split('/')[2] || '').toLowerCase();
const raiz = document.getElementById('raiz');

(async () => {
  let c;
  try {
    const r = await fetch(`/api/publico/colegio/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error();
    c = await r.json();
  } catch { raiz.innerHTML = '<p class="carga">No encontramos este colegio.</p>'; return; }
  const ra = document.documentElement.style;
  ra.setProperty('--marca', c.color_primario || '#1e3a8a');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt((c.color_primario || '#1e3a8a').slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  ra.setProperty('--sobre', 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#ffffff');
  document.title = `${c.nombre} · Chat del colegio`;
  const pagina = `${location.origin}/colegio/${encodeURIComponent(c.slug)}`;
  const dato = [c.direccion, c.telefono ? `Tel. ${c.telefono}` : ''].filter(Boolean).map(esc).join(' · ');
  raiz.innerHTML = `
    <header class="cab">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : ''}<h1>${esc(c.nombre)}</h1><p>Chat virtual del colegio</p></header>
    <div class="acciones">
      <a class="btn p" href="/admision/${encodeURIComponent(c.slug)}"><span class="i">💬</span><span>Hablar con el colegio<small>Información, requisitos y visitas. Responde a cualquier hora.</small></span></a>
      <a class="btn" href="/e/${encodeURIComponent(c.slug)}"><span class="i">📲</span><span>Instalar el chat en mi celular<small>Para padres, profesores y personal del colegio. Se entra una vez con tu DNI.</small></span></a>
    </div>
    <div class="qr">${qrSvg(pagina, { escala: 6, margen: 2 })}<p>Escanea este código con la cámara de tu celular</p></div>
    ${dato ? `<p class="datos">${dato}</p>` : ''}
    <p class="pie">Chat escolar privado · ColegIA</p>`;
})();
