// Instalar ColegIA en el celular como app. Se ofrece justo después de ingresar; ya instalada,
// se abre directo con la sesión guardada (sin pedir colegio, puesto ni contraseña).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let evento = null, caja = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evento = e; if (caja) pintar(); });
window.addEventListener('appinstalled', () => { evento = null; if (caja) { caja.remove(); caja = null; } guardar('colegia_instalar', String(Date.now() + 3650 * 864e5)); });

function pasos() {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|TikTok|musical_ly/i.test(ua)) return 'Estás dentro de otra app. Abre este mismo enlace en Chrome (Android) o Safari (iPhone) para poder instalar.';
  if (/iphone|ipad|ipod/i.test(ua)) return 'En iPhone: toca el botón Compartir (el cuadrito con la flecha) y luego «Añadir a pantalla de inicio».';
  if (/android/i.test(ua)) return 'En Android: toca los tres puntos ⋮ de Chrome y luego «Instalar app» (o «Añadir a pantalla de inicio»).';
  return 'En la computadora: toca el ícono de instalar que aparece a la derecha de la barra de direcciones de Chrome.';
}
function pintar() {
  if (!caja) return;
  caja.innerHTML = '';
  const t = document.createElement('div');
  t.innerHTML = '<strong style="font-size:16px">📲 Instala ColegIA en tu celular</strong><br><span></span>';
  t.querySelector('span').textContent = evento ? 'Tendrás un ícono en tu pantalla para entrar con un toque, sin escribir tu colegio ni tu contraseña.' : pasos();
  t.style.flex = '1';
  caja.append(t);
  if (evento) {
    const b = document.createElement('button');
    b.textContent = 'Instalar ahora';
    b.style.cssText = 'background:#f59e0b;color:#1b2333;border:0;border-radius:999px;padding:11px 18px;font-weight:800;cursor:pointer;font-size:15px';
    b.onclick = async () => { try { evento.prompt(); await evento.userChoice; } catch { /* cancelado */ } evento = null; pintar(); };
    caja.append(b);
  }
  const x = document.createElement('button');
  x.textContent = '✕'; x.setAttribute('aria-label', 'Ahora no');
  x.style.cssText = 'background:none;border:0;color:#fff;font-size:20px;cursor:pointer;align-self:flex-start';
  x.onclick = () => { caja.remove(); caja = null; guardar('colegia_instalar', String(Date.now() + 7 * 864e5)); };
  caja.append(x);
}
export function ofrecerInstalacion() {
  if (instalada() || caja) return;
  if (Number(leer('colegia_instalar') || 0) > Date.now()) return;
  caja = document.createElement('div');
  caja.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#1e3a8a;color:#fff;border-radius:16px;padding:14px 16px;display:flex;gap:12px;align-items:center;box-shadow:0 10px 32px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif;max-width:560px;margin:0 auto';
  document.body.append(caja);
  pintar();
}
