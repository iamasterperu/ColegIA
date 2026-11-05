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

// Convierte la imagen subida en logo (pequeño) e ícono de la app (512×512 con el color del colegio de fondo)
function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => mal(new Error('No pude leer esa imagen. Usa un PNG o JPG.'));
    img.src = url;
  });
}
async function prepararImagen(archivo, colorFondo) {
  const img = await cargarImagen(archivo);
  const lienzo = (lado, relleno, margen) => {
    const c = document.createElement('canvas'); c.width = c.height = lado;
    const g = c.getContext('2d');
    if (relleno) { g.fillStyle = relleno; g.fillRect(0, 0, lado, lado); }
    const caja = lado * (1 - margen * 2), e = Math.min(caja / img.width, caja / img.height);
    g.drawImage(img, (lado - img.width * e) / 2, (lado - img.height * e) / 2, img.width * e, img.height * e);
    return c;
  };
  let logo = lienzo(256, null, 0).toDataURL('image/png');
  if (logo.length > 140000) logo = lienzo(256, null, 0).toDataURL('image/webp', 0.9);
  let icono = lienzo(512, colorFondo, 0.12).toDataURL('image/png');
  if (icono.length > 850000) icono = lienzo(384, colorFondo, 0.12).toDataURL('image/png');
  return { logo, icono };
}

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
      <label>Nombre corto bajo el ícono (máx. 20 letras)<input name="nombre_corto" maxlength="20" placeholder="Ej. Talentus Villa"></label><label>Logo / ícono del colegio (imagen cuadrada)<input name="imagen" type="file" accept="image/*"></label>
      <label>Color principal<input name="color_primario" type="color" value="#1e3a8a"></label><label>Color secundario<input name="color_secundario" type="color" value="#f59e0b"></label></div>
      <div class="msg" id="mn"></div><button>Crear colegio</button><div id="rn"></div></form></div>
    ${colegios.map((c) => `<div class="card" data-id="${c.id}"><h2>${esc(c.nombre)} <span class="tag">${esc(c.slug)}</span>${c.es_demo ? '<span class="tag">demo</span>' : ''}<span class="tag ${c.suspendido ? 'mal' : 'ok'}">${c.suspendido ? 'suspendido' : 'activo'}</span></h2>
      <div class="peq">${c.usuarios} usuarios · ${c.alumnos} alumnos · WhatsApp: ${c.wa_modo === 'cloud' ? 'conectado' : 'simulado'} · Último ingreso: ${esc(c.ultimo_acceso || '—')}</div>
      <div class="fila"><button class="g us">Usuarios y accesos</button>
        <button class="g sus" data-s="${c.suspendido ? 0 : 1}">${c.suspendido ? 'Reactivar servicio' : 'Suspender servicio'}</button>
        <button class="g vis" data-v="${c.mostrar_en_ingreso ? 0 : 1}">${c.mostrar_en_ingreso ? 'Ocultar de la lista de ingreso' : 'Mostrar en la lista de ingreso'}</button></div>
      <div class="marca"><img class="ico" src="/i/${esc(c.slug)}/icono-192.png?v=${Date.now()}" alt="" width="56" height="56" style="border-radius:12px;background:#eee;vertical-align:middle">
        <b>${esc(c.nombre_corto || '(nombre corto automático)')}</b> <span class="peq">${c.tiene_icono ? 'con ícono propio' : 'sin ícono propio'}</span></div>
      <div class="fila"><button class="g mar">Ícono y nombre de la app</button><button class="g qr">Enlace y QR del colegio</button></div>
      <div class="det"></div><div class="det2"></div></div>`).join('')}`;
  document.getElementById('salir').onclick = async () => { await api('POST', '/api/dueno/logout'); pantallaLogin(); };
  document.getElementById('nuevo').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const datos = Object.fromEntries(new FormData(ev.target)), archivo = datos.imagen; delete datos.imagen;
      if (archivo && archivo.size) Object.assign(datos, await prepararImagen(archivo, datos.color_primario));
      const r = await api('POST', '/api/dueno/colegios', datos); document.getElementById('rn').innerHTML = `<p>✅ Colegio creado. Envía este enlace a la dirección para que cree su contraseña:</p>${copiable(r.enlace)}`; }
    catch (er) { document.getElementById('mn').textContent = er.message; }
  };
  raiz.querySelectorAll('.card[data-id]').forEach((card) => {
    const id = card.dataset.id, det = card.querySelector('.det');
    card.querySelector('.sus').onclick = async (e) => {
      if (e.target.dataset.s === '1' && !confirm('¿Suspender el servicio? Nadie del colegio podrá entrar hasta que lo reactives.')) return;
      await api('PUT', `/api/dueno/colegios/${id}`, { suspendido: e.target.dataset.s === '1' }); panel();
    };
    card.querySelector('.vis').onclick = async (e) => { await api('PUT', `/api/dueno/colegios/${id}`, { mostrar_en_ingreso: e.target.dataset.v === '1' }); panel(); };
    const det2 = card.querySelector('.det2'), colegio = colegios.find((x) => String(x.id) === id);
    card.querySelector('.mar').onclick = () => {
      det2.innerHTML = `<form class="fm"><div class="cols"><label>Nombre corto bajo el ícono (máx. 20)<input name="nombre_corto" maxlength="20" value="${esc(colegio.nombre_corto || '')}" placeholder="Ej. Talentus Villa"></label>
        <label>Nueva imagen del colegio (cuadrada)<input name="imagen" type="file" accept="image/*"></label></div>
        <div class="msg"></div><button>Guardar</button> <span class="peq">El ícono se ve así en el celular de padres, profesores y dirección al instalar la app.</span></form>`;
      det2.querySelector('.fm').onsubmit = async (ev) => {
        ev.preventDefault();
        const msg = det2.querySelector('.msg'); msg.textContent = '';
        try {
          const f = Object.fromEntries(new FormData(ev.target)), cambios = { nombre_corto: f.nombre_corto || '' };
          if (f.imagen && f.imagen.size) Object.assign(cambios, await prepararImagen(f.imagen, colegio.color_primario));
          await api('PUT', `/api/dueno/colegios/${id}`, cambios); panel();
        } catch (er) { msg.textContent = er.message; }
      };
    };
    card.querySelector('.qr').onclick = async () => {
      const origen = location.origin, pagina = `${origen}/e/${colegio.slug}/info`;
      const { qrPng } = await import('/js/qr.js');
      const png = qrPng(pagina, 600);
      det2.innerHTML = `<div class="peq">Pon esto en la web del colegio: la página con el botón y el QR, o solo el QR.</div>
        <div class="enlace">${esc(pagina)}</div><div class="fila"><button class="g cop" data-e="${esc(pagina)}">Copiar enlace de la página del colegio</button></div>
        <div class="peq">App instalable: ${esc(origen)}/e/${esc(colegio.slug)}/ · Chat para familias nuevas: ${esc(origen)}/admision/${esc(colegio.slug)}</div>
        <img src="${png}" alt="QR" width="200" height="200" style="margin:8px 0"><br><a class="g" style="display:inline-block;padding:8px 12px" download="qr-${esc(colegio.slug)}.png" href="${png}">Descargar QR (PNG)</a>`;
    };
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
