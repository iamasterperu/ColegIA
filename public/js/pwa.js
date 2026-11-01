// Instalar ColegIA en el celular como una app (acceso directo en la pantalla de inicio).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const guardado = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function banner(texto, boton, alAceptar) {
  if (instalada() || guardado('colegia_instalar') === 'no') return;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#1e3a8a;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 28px rgba(0,0,0,.3);font:14px/1.35 system-ui,sans-serif;max-width:520px;margin:0 auto';
  const t = document.createElement('span'); t.style.flex = '1'; t.textContent = texto; d.append(t);
  if (boton) { const b = document.createElement('button'); b.textContent = boton; b.style.cssText = 'background:#f59e0b;color:#1b2333;border:0;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer'; b.onclick = () => { d.remove(); alAceptar(); }; d.append(b); }
  const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Cerrar'); x.style.cssText = 'background:none;border:0;color:#fff;font-size:18px;cursor:pointer'; x.onclick = () => { d.remove(); guardado('colegia_instalar', 'no'); }; d.append(x);
  document.body.append(d);
}
let evento = null;
const hayBoton = () => !!document.querySelector('[data-instalar]');
// Botón «Instalar» de la portada: instala (si el navegador deja) y siempre termina en el ingreso
document.addEventListener('click', async (e) => {
  const a = e.target.closest?.('[data-instalar]');
  if (!a) return;
  e.preventDefault();
  if (evento) { try { evento.prompt(); await evento.userChoice; } catch { /* sin respuesta */ } evento = null; }
  location.href = '/entrar?instalar=1';
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); evento = e;
  if (!hayBoton()) banner('Instala ColegIA en tu celular para entrar con un toque.', 'Instalar', async () => { evento.prompt(); await evento.userChoice.catch(() => {}); evento = null; });
});
// iPhone no avisa solo: se explica el paso a paso
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !instalada() && !hayBoton()) setTimeout(() => banner('Para instalar ColegIA: toca Compartir y luego «Añadir a pantalla de inicio».'), 4000);
