// Página pública de un colegio: botones para hablar con el colegio o instalar su chat, y su QR.
import { qrSvg } from './qr.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (location.pathname.split('/')[2] || '').toLowerCase();
const raiz = document.getElementById('raiz');

// Instalar el chat del colegio directamente desde esta página (sin pasar por otra pantalla)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let evento = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evento = e; });
window.addEventListener('appinstalled', () => { evento = null; const d = document.getElementById('ayuda'); if (d) { d.hidden = false; d.textContent = '✅ ¡Listo! Busca el ícono del colegio en la pantalla de tu celular y ábrelo para entrar con tu DNI.'; } });
const pasos = () => {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|TikTok|musical_ly/i.test(ua)) return 'Estás dentro de otra app. Abre este mismo enlace en Chrome (Android) o Safari (iPhone) para poder instalar.';
  if (/iphone|ipad|ipod/i.test(ua)) return 'En iPhone: abre esta página en Safari, toca el botón Compartir (el cuadrito con la flecha) y luego «Añadir a pantalla de inicio».';
  if (/android/i.test(ua)) return 'En Android: toca los tres puntos ⋮ de Chrome y luego «Instalar app» (o «Añadir a pantalla de inicio»).';
  return 'En la computadora: toca el ícono de instalar que aparece a la derecha de la barra de direcciones de Chrome.';
};
document.addEventListener('click', async (ev) => {
  if (!ev.target.closest('#instalar')) return;
  ev.preventDefault();
  const ayuda = document.getElementById('ayuda');
  if (evento) { try { evento.prompt(); await evento.userChoice; } catch { /* cancelado */ } evento = null; return; }
  ayuda.hidden = false; ayuda.textContent = pasos();
});

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
      <a class="btn" id="instalar" href="/e/${encodeURIComponent(c.slug)}"><span class="i">📲</span><span>Instalar el chat en mi celular<small>Para padres, profesores y personal del colegio. Se entra una vez con tu DNI.</small></span></a>
      <p class="ayuda" id="ayuda" hidden></p>
      <a class="enlace" href="/e/${encodeURIComponent(c.slug)}">Ya lo tengo instalado o prefiero usarlo desde el navegador</a>
    </div>
    <div class="qr">${qrSvg(pagina, { escala: 6, margen: 2 })}<p>Escanea este código con la cámara de tu celular</p></div>
    ${dato ? `<p class="datos">${dato}</p>` : ''}
    <p class="pie">Chat escolar privado · ColegIA</p>`;
})();
