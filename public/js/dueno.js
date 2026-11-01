// Panel privado del dueño: todos los colegios, sus usuarios y sus accesos, desde el celular o la computadora.
const raiz = document.getElementById('raiz');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NOMBRES = { direccion: 'Dirección', secretaria: 'Secretaría', profesor: 'Profesor(a)', contabilidad: 'Contabilidad' };
async function api(metodo, ruta, datos) {
  const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-colegia': '1' }, body: datos ? JSON.stringify(datos) : undefined });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(t.error || 'Error'), { estado: r.status });
  return t;
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

function copiable(enlace) {
  return `<div class="enlace">${esc(enlace)}</div><div class="fila"><button class="g cop" data-e="${esc(enlace)}">Copiar enlace</button><span class="peq">Sirve una sola vez y vence en 7 días. Envíaselo solo a esa persona.</span></div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.cop');
  if (b) { try { await navigator.clipboard.writeText(b.dataset.e); b.textContent = '¡Copiado!'; } catch { b.textContent = 'Copia el texto a mano'; } }
});

function pantallaLogin(msg = '') {
  raiz.innerHTML = `<div class="card" style="max-width:380px;margin:12vh auto"><h1>Panel</h1><p class="peq">Acceso privado.</p>
    <form id="f"><label>Correo<input name="email" type="email" autocomplete="username" required></label>
    <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
    <div class="msg">${esc(msg)}</div><button>Entrar</button></form></div>`;
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/api/dueno/login', Object.fromEntries(new FormData(ev.target))); panel(); } catch (er) { pantallaLogin(er.message); }
  };
}
async function pantallaActivar(token) {
  try { await api('GET', `/api/publico/dueno-invitacion/${token}`); } catch (er) { return pantallaLogin(er.message); }
  raiz.innerHTML = `<div class="card" style="max-width:380px;margin:12vh auto"><h1>Crea tu contraseña</h1><p class="peq">Mínimo 8 caracteres, con letras y números. Solo la sabrás tú.</p>
    <form id="f"><label>Contraseña<input name="clave" type="password" autocomplete="new-password" minlength="8" required></label>
    <label>Repítela<input name="otra" type="password" autocomplete="new-password" minlength="8" required></label><div class="msg" id="m"></div><button>Guardar y entrar</button></form></div>`;
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    if (f.clave !== f.otra) return (document.getElementById('m').textContent = 'Las contraseñas no son iguales');
    try { await api('POST', '/api/dueno/activar', { token, clave: f.clave }); history.replaceState(null, '', '/panel-iamaster'); panel(); } catch (er) { document.getElementById('m').textContent = er.message; }
  };
}

async function panel() {
  let colegios;
  try { colegios = (await api('GET', '/api/dueno/colegios')).colegios; } catch (er) { return er.estado === 401 ? pantallaLogin() : (raiz.textContent = er.message); }
  raiz.innerHTML = `<div class="top"><h1>🎓 ColegIA · Mis colegios</h1><span></span><button class="g" id="salir">Salir</button></div>
    <div id="inst"></div>
    <div class="card"><h2>➕ Nuevo colegio</h2><form id="nuevo"><div class="cols"><label>Nombre del colegio<input name="nombre" required></label><label>Código (sin espacios, ej. santarosa)<input name="slug" required pattern="[a-z0-9-]{3,30}"></label>
      <label>Nombre de la directora o director<input name="director_nombre" required></label><label>Correo de la dirección<input name="director_email" type="email" required></label>
      <label>Color principal<input name="color_primario" type="color" value="#1e3a8a"></label><label>Color secundario<input name="color_secundario" type="color" value="#f59e0b"></label></div>
      <div class="msg" id="mn"></div><button>Crear colegio</button><div id="rn"></div></form></div>
    ${colegios.map((c) => `<div class="card" data-id="${c.id}"><h2>${esc(c.nombre)} <span class="tag">${esc(c.slug)}</span>${c.es_demo ? '<span class="tag">demo</span>' : ''}<span class="tag ${c.suspendido ? 'mal' : 'ok'}">${c.suspendido ? 'suspendido' : 'activo'}</span></h2>
      <div class="peq">${c.usuarios} usuarios · ${c.alumnos} alumnos · WhatsApp: ${c.wa_modo === 'cloud' ? 'conectado' : 'simulado'} · Último ingreso: ${esc(c.ultimo_acceso || '—')}</div>
      <div class="fila"><button class="g us">Usuarios y accesos</button>
        <button class="g sus" data-s="${c.suspendido ? 0 : 1}">${c.suspendido ? 'Reactivar servicio' : 'Suspender servicio'}</button>
        <button class="g vis" data-v="${c.mostrar_en_ingreso ? 0 : 1}">${c.mostrar_en_ingreso ? 'Ocultar de la lista de ingreso' : 'Mostrar en la lista de ingreso'}</button></div>
      <div class="det"></div></div>`).join('')}`;
  document.getElementById('salir').onclick = async () => { await api('POST', '/api/dueno/logout'); pantallaLogin(); };
  document.getElementById('nuevo').onsubmit = async (ev) => {
    ev.preventDefault();
    try { const r = await api('POST', '/api/dueno/colegios', Object.fromEntries(new FormData(ev.target))); document.getElementById('rn').innerHTML = `<p>✅ Colegio creado. Envía este enlace a la dirección para que cree su contraseña:</p>${copiable(r.enlace)}`; }
    catch (er) { document.getElementById('mn').textContent = er.message; }
  };
  raiz.querySelectorAll('.card[data-id]').forEach((card) => {
    const id = card.dataset.id, det = card.querySelector('.det');
    card.querySelector('.sus').onclick = async (e) => {
      if (e.target.dataset.s === '1' && !confirm('¿Suspender el servicio? Nadie del colegio podrá entrar hasta que lo reactives.')) return;
      await api('PUT', `/api/dueno/colegios/${id}`, { suspendido: e.target.dataset.s === '1' }); panel();
    };
    card.querySelector('.vis').onclick = async (e) => { await api('PUT', `/api/dueno/colegios/${id}`, { mostrar_en_ingreso: e.target.dataset.v === '1' }); panel(); };
    card.querySelector('.us').onclick = async () => {
      const { usuarios } = await api('GET', `/api/dueno/colegios/${id}/usuarios`);
      det.innerHTML = `<table>${usuarios.map((u) => `<tr data-u="${u.id}"><td><b>${esc(u.nombre)}</b><br><span class="peq">${esc(u.email)}</span></td><td>${esc(NOMBRES[u.rol] || u.rol)}</td>
        <td class="peq">${u.con_clave ? 'con contraseña' : 'sin crear'}${u.activo ? '' : ' · desactivado'}</td><td><button class="g en">Enlace de contraseña</button> <button class="g ac" data-a="${u.activo ? 0 : 1}">${u.activo ? 'Desactivar' : 'Activar'}</button><div class="re"></div></td></tr>`).join('')}</table>
        <form class="nu"><div class="cols"><label>Nombre<input name="nombre" required></label><label>Correo<input name="email" type="email" required></label>
        <label>Puesto<select name="rol">${Object.entries(NOMBRES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div><div class="msg"></div><button>Añadir persona y generar enlace</button><div class="rn"></div></form>`;
      det.querySelectorAll('tr[data-u]').forEach((tr) => {
        tr.querySelector('.en').onclick = async () => { const r = await api('POST', `/api/dueno/usuarios/${tr.dataset.u}/enlace`); tr.querySelector('.re').innerHTML = copiable(r.enlace); };
        tr.querySelector('.ac').onclick = async (e) => { await api('PUT', `/api/dueno/usuarios/${tr.dataset.u}`, { activo: e.target.dataset.a === '1' }); card.querySelector('.us').click(); };
      });
      det.querySelector('.nu').onsubmit = async (ev) => {
        ev.preventDefault();
        try { const r = await api('POST', `/api/dueno/colegios/${id}/usuarios`, Object.fromEntries(new FormData(ev.target))); det.querySelector('.rn').innerHTML = copiable(r.enlace); }
        catch (er) { det.querySelector('.msg').textContent = er.message; }
      };
    };
  });
  pintarInstalar();
}

// Instalar este panel como una app aparte (con su propio ícono), solo en tu celular
let evInstalar = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function pintarInstalar() {
  const c = document.getElementById('inst');
  if (!c || instalada()) return;
  if (evInstalar) { c.innerHTML = '<div class="card"><button id="ins">📲 Instalar mi panel como app</button></div>'; document.getElementById('ins').onclick = async () => { evInstalar.prompt(); await evInstalar.userChoice.catch(() => {}); evInstalar = null; c.innerHTML = ''; }; }
  else c.innerHTML = '<div class="card peq">Para instalar este panel como app: en Android toca ⋮ de Chrome y «Instalar app»; en iPhone, Compartir y «Añadir a pantalla de inicio». Ábrelo en Chrome o Safari, no dentro de otra app.</div>';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evInstalar = e; pintarInstalar(); });

const token = new URLSearchParams(location.search).get('activar');
if (token) pantallaActivar(token); else panel();
