// ColegIA — arranque de la app, ingreso, menú por rol y enrutador.
import { api } from './api.js';
import { html, crudo, $, aviso, ROL_NOMBRE } from './ui.js';

const ICONOS = {
  buscar: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3',
  panel: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  pagos: 'M3 6h18v12H3zM3 10h18M7 15h3',
  utiles: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM8 7h8M8 11h6',
  whatsapp: 'M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.7-5.2A8.5 8.5 0 1 1 21 12Z',
  importar: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  ojo: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  usuarios: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  familia: 'M3 10.5 12 3l9 7.5V21H3V10.5ZM9 21v-6h6v6',
  candado: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  docente: 'M12 3 2 8l10 5 10-5-10-5Zm-6 7.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5',
  alerta: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
};
// Ícono del chat del colegio: globo de conversación verde con birrete
export const ICONO_CHAT = '<svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true"><path d="M32 6C17.6 6 6 16.7 6 30c0 5.3 1.9 10.2 5.1 14.2L8 57l13-4.2c3.3 1.4 6.9 2.2 11 2.2 14.4 0 26-10.7 26-24S46.4 6 32 6Z" fill="#fff"/><path d="M18 28l14-7 14 7-14 7-14-7Zm6 4v6c0 2 4 4 8 4s8-2 8-4v-6" fill="none" stroke="#00a884" stroke-width="3" stroke-linejoin="round"/></svg>';
const ICONO_TAB_CHAT = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.7-5.2A8.5 8.5 0 1 1 21 12Z"/></svg>';
export const icono = (n) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;

export const MENU = [
  { ruta: 'chat', texto: 'Chat del colegio', icono: 'whatsapp' },
  { ruta: 'inicio', texto: 'Buscar alumno', icono: 'buscar', ver: (s) => s.usuario.rol !== 'padre' },
  { ruta: 'inicio', texto: 'Mis hijos', icono: 'familia', ver: (s) => s.usuario.rol === 'padre' },
  { ruta: 'panel', texto: 'Panel de dirección', icono: 'panel', permiso: 'panel.ver' },
  { ruta: 'docente', texto: 'Asistente docente', icono: 'docente', ver: (s) => ['direccion', 'profesor', 'secretaria'].includes(s.usuario.rol) },
  { ruta: 'asistencia', texto: 'Asistencia (tomar lista)', icono: 'docente', permiso: 'asistencia.tomar' },
  { ruta: 'automatizacion', texto: 'Automatización y reportes', icono: 'panel', permiso: 'comunicados.aprobar' },
  { ruta: 'alertas', texto: 'Alertas tempranas', icono: 'alerta', ver: (s) => ['direccion', 'profesor', 'secretaria'].includes(s.usuario.rol) },
  { ruta: 'pagos', texto: 'Pagos y recordatorios', icono: 'pagos', permiso: 'pagos.ver' },
  { ruta: 'utiles', texto: 'Listas de útiles', icono: 'utiles', permiso: 'utiles.ver' },
  { ruta: 'admision', texto: 'Admisiones', icono: 'familia', permiso: 'admision.ver' },
  { ruta: 'informes', texto: 'Información del colegio', icono: 'utiles', permiso: 'informes.editar' },
  { ruta: 'importar', texto: 'Importar Excel', icono: 'importar', ver: (s) => s.permisos.some((p) => p.startsWith('importar.alumnos') || p === 'importar.pagos' || p === 'usuarios.gestionar') },
  { ruta: 'datos', texto: 'Protección de datos', icono: 'escudo', ver: (s) => s.permisos.includes('consentimientos.ver') || s.permisos.includes('consentimientos.propios') },
  { ruta: 'auditoria', texto: 'Registro de accesos', icono: 'ojo', permiso: 'auditoria.ver' },
  { ruta: 'usuarios', texto: 'Usuarios y roles', icono: 'usuarios', permiso: 'usuarios.gestionar' },
  { ruta: 'ajustes', texto: 'Ajustes del colegio', icono: 'ajustes', permiso: 'ajustes.editar' },
  { ruta: 'cuenta', texto: 'Mi cuenta', icono: 'candado' },
];

const VISTAS = {
  chat: () => import('./vistas/chat.js'),
  mipanel: () => import('./vistas/mipanel.js'),
  inicio: () => import('./vistas/inicio.js'),
  alumno: () => import('./vistas/ficha.js'),
  panel: () => import('./vistas/panel.js'),
  pagos: () => import('./vistas/pagos.js'),
  utiles: () => import('./vistas/utiles.js'),
  whatsapp: () => import('./vistas/whatsapp.js'),
  importar: () => import('./vistas/importar.js'),
  datos: () => import('./vistas/datos.js'),
  auditoria: () => import('./vistas/auditoria.js'),
  usuarios: () => import('./vistas/usuarios.js'),
  ajustes: () => import('./vistas/ajustes.js'),
  cuenta: () => import('./vistas/cuenta.js'),
  docente: () => import('./vistas/docente.js'),
  alertas: () => import('./vistas/alertas.js'),
  admision: () => import('./vistas/admision.js'),
  informes: () => import('./vistas/informes.js'),
  asistencia: () => import('./vistas/asistencia.js'),
  automatizacion: () => import('./vistas/automatizacion.js'),
};

export const sesion = { usuario: null, permisos: [], colegio: null, finalidades: {} };
export const puede = (p) => sesion.permisos.includes(p);

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

// Colores del colegio: el texto sobre el color primario se elige por contraste
export function aplicarMarca(c) {
  const raiz = document.documentElement;
  raiz.style.setProperty('--marca', c.color_primario);
  raiz.style.setProperty('--marca-2', c.color_secundario);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.color_primario.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  raiz.style.setProperty('--sobre-marca', lum > 0.4 ? '#111827' : '#ffffff');
  document.title = COLEGIO_PROPIO ? c.nombre : `${c.nombre} · ColegIA`;
}

// App de un colegio instalada desde /e/<colegio>: el colegio ya viene elegido y no se muestran otros
const COLEGIO_PROPIO = (/^\/e\/([a-z0-9-]{3,30})\/?$/.exec(location.pathname) || [])[1] || '';
const BASE = COLEGIO_PROPIO ? `/e/${COLEGIO_PROPIO}` : '/entrar';

async function pantallaIngreso(mensaje) {
  const app = $('#app');
  const params = new URLSearchParams(location.search);
  if (params.get('inv')) return pantallaInvitacion(params.get('inv'));
  let slug = (COLEGIO_PROPIO || params.get('c') || leer('colegia:colegio') || '').toLowerCase();
  let lista = [];
  if (!COLEGIO_PROPIO) {
    try { lista = (await api.get('/api/publico/colegios')).colegios; } catch { lista = []; }
    if (!lista.some((c) => c.slug === slug)) slug = '';
  }
  let colegio = null;
  if (slug) { try { colegio = await api.get(`/api/publico/colegio/${encodeURIComponent(slug)}`); } catch { colegio = null; } }
  if (colegio) aplicarMarca(colegio);

  app.innerHTML = html`
    <main class="ingreso">
      <section class="ingreso-caja">
        <div class="ingreso-marca">
          ${colegio?.logo ? html`<img src="${colegio.logo}" alt="" class="logo-grande">` : html`<div class="logo-chat-wa">${crudo(ICONO_CHAT)}</div>`}
          <div><p class="sobretitulo">${COLEGIO_PROPIO ? 'Chat del colegio' : 'ColegIA · el chat de tu colegio'}</p><h1>${colegio?.nombre || 'Ingresa a tu colegio'}</h1></div>
        </div>
        <div id="zona-instalar"></div>
        ${mensaje ? html`<p class="alerta">${mensaje}</p>` : ''}
        <form id="form-dni" class="form">
          ${COLEGIO_PROPIO ? crudo(`<input type="hidden" name="colegio" value="${slug}">`) : ''}${COLEGIO_PROPIO ? '' : crudo(html`<label>Colegio<select name="colegio" required><option value="">Elige tu colegio…</option>${lista.map((c) => html`<option value="${c.slug}" ${c.slug === slug ? crudo('selected') : ''}>${c.nombre}</option>`)}</select></label>`)}
          <label>Soy…<select name="rol" required><option value="">Elige tu puesto…</option><option value="padre">Padre / madre / apoderado</option><option value="direccion">Dirección</option><option value="secretaria">Secretaría</option><option value="contabilidad">Contabilidad</option><option value="profesor">Profesor(a) / auxiliar</option></select></label>
          <label>Tu DNI<input name="dni" inputmode="numeric" autocomplete="off" maxlength="12" required placeholder="8 dígitos"></label>
          <label>Tu celular registrado en el colegio<input name="celular" type="tel" inputmode="tel" autocomplete="tel" required placeholder="9XXXXXXXX"></label>
          <div id="zona-clave" hidden>
            <label>Contraseña<input name="clave" type="password" autocomplete="current-password" placeholder="Si ya creaste tu contraseña"></label>
            <div id="zona-crear" hidden>
              <label>Crea tu contraseña<input name="crear_clave" type="password" autocomplete="new-password" minlength="8" placeholder="mín. 8, letras y números"></label>
              <label>Repite tu contraseña<input name="repetir_clave" type="password" autocomplete="new-password" minlength="8"></label>
            </div>
            <button class="btn btn-fantasma" id="alternar-crear" type="button">Crear mi contraseña</button>
            <p class="pequeno">La contraseña es opcional y la crea cada persona. Quien la crea, desde entonces entra con DNI, celular y contraseña.</p>
          </div>
          <button class="btn btn-primario" type="submit">Entrar al chat</button>
          <p class="pequeno">Solo la primera vez. Después abres la app y entras con un toque. El sistema reconoce si eres padre o madre, profesor(a), dirección, secretaría o contabilidad.</p>
        </form>
        <button class="btn btn-fantasma" id="familia-nueva" type="button">¿Familia nueva? Pregunta por el colegio</button>
        <details class="otro-ingreso"><summary>Entrar con correo y contraseña</summary>
        <form id="form-ingreso" class="form">
          <label>Puesto<select name="rol" required><option value="">Elige tu puesto…</option><option value="direccion">Dirección</option><option value="secretaria">Secretaría</option><option value="profesor">Profesor(a)</option><option value="contabilidad">Contabilidad</option><option value="padre">Padre / Apoderado</option></select></label>
          <label>Correo<input name="email" type="email" autocomplete="username" required></label>
          <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primario" type="submit">Ingresar</button>
        </form></details>
        <p class="pequeno"><a href="/privacidad?c=${slug}">Aviso de privacidad</a> · Tus datos están protegidos según la Ley 29733.</p>
      </section>
    </main>`;
  import('./pwa.js').then((m) => m.botonInstalar($('#zona-instalar'))).catch(() => {});
  // Este celular ya tenía una sesión abierta (por ejemplo de una prueba): se ofrece seguir o entrar con otra cuenta
  api.get('/api/yo').then((y) => {
    if (!y?.usuario || !$('#zona-instalar')) return;
    const aviso2 = document.createElement('div');
    aviso2.className = 'sesion-previa';
    aviso2.innerHTML = html`<p>Este celular ya tiene una sesión abierta: <strong>${y.usuario.nombre}</strong> (${y.usuario.rol_nombre}).</p>
      <button type="button" class="btn btn-primario" id="seguir-sesion">Continuar como ${y.usuario.nombre.split(' ')[0]}</button>
      <button type="button" class="btn btn-fantasma" id="otra-cuenta">Entrar con otra cuenta</button>`;
    $('#zona-instalar').after(aviso2);
    $('#seguir-sesion').addEventListener('click', () => { history.replaceState(null, '', BASE); iniciar(); });
    $('#otra-cuenta').addEventListener('click', async () => { await api.post('/api/logout').catch(() => {}); aviso2.remove(); });
  }).catch(() => {});

  const formDni = $('#form-dni');
  const elegido = () => formDni.colegio.value.trim().toLowerCase();
  const ir = async (url, datos, boton) => {
    boton.disabled = true;
    try {
      await api.post(url, datos);
      guardar('colegia:colegio', datos.colegio.trim().toLowerCase());
      if (params.has('c') || params.has('instalar')) history.replaceState(null, '', BASE);
      await iniciar();
    } catch (er) { aviso(er.message, 'error'); } finally { boton.disabled = false; }
  };
  // Dirección, secretaría y contabilidad pueden crear su propia contraseña
  const CON_CLAVE = ['direccion', 'secretaria', 'contabilidad', 'profesor', 'padre'];
  const zonaClave = $('#zona-clave'), zonaCrear = $('#zona-crear'), botonCrear = $('#alternar-crear');
  const mostrarClave = () => {
    const conClave = CON_CLAVE.includes(formDni.rol.value);
    zonaClave.hidden = !conClave;
    if (!conClave) { zonaCrear.hidden = true; formDni.clave.value = ''; formDni.crear_clave.value = ''; formDni.repetir_clave.value = ''; }
  };
  formDni.rol.addEventListener('change', mostrarClave);
  botonCrear.addEventListener('click', () => {
    zonaCrear.hidden = !zonaCrear.hidden;
    botonCrear.textContent = zonaCrear.hidden ? 'Crear mi contraseña' : 'Ya tengo contraseña';
    formDni.clave.closest('label').hidden = !zonaCrear.hidden;
    if (!zonaCrear.hidden) formDni.crear_clave.focus();
  });
  mostrarClave();
  formDni.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(formDni));
    if (!zonaCrear.hidden) {
      if (datos.crear_clave !== datos.repetir_clave) return aviso('Las contraseñas no son iguales', 'error');
      delete datos.clave;
    } else delete datos.crear_clave;
    delete datos.repetir_clave;
    ir('/api/ingreso-dni', datos, formDni.querySelector('button[type=submit]'));
  });
  $('#familia-nueva').addEventListener('click', () => {
    const c = elegido();
    if (!c) return aviso('Primero elige el colegio', 'error');
    location.href = `/admision/${encodeURIComponent(c)}`;
  });
  const form = $('#form-ingreso');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    datos.colegio = elegido();
    if (!datos.colegio) return aviso('Elige tu colegio', 'error');
    datos.recordar = true;
    ir('/api/login', datos, form.querySelector('button'));
  });
  formDni.colegio.addEventListener('change', () => {
    const nuevo = elegido();
    if (nuevo && nuevo !== slug) { guardar('colegia:colegio', nuevo); history.replaceState(null, '', `${BASE}?c=${encodeURIComponent(nuevo)}`); pantallaIngreso(); }
  });
}

// Enlace de un solo uso que recibe cada persona para crear su propia contraseña
async function pantallaInvitacion(token) {
  const app = $('#app');
  let inv;
  try { inv = await api.get(`/api/publico/invitacion/${encodeURIComponent(token)}`); } catch (e) {
    history.replaceState(null, '', '/entrar');
    return pantallaIngreso(e.message);
  }
  const puesto = { direccion: 'Dirección', secretaria: 'Secretaría', profesor: 'Profesor(a)', contabilidad: 'Contabilidad', padre: 'Padre / Apoderado' }[inv.rol] || inv.rol;
  app.innerHTML = html`
    <main class="ingreso"><section class="ingreso-caja">
      <div class="ingreso-marca"><div class="logo-letra">${inv.colegio[0]}</div><div><p class="sobretitulo">ColegIA</p><h1>${inv.colegio}</h1></div></div>
      <p>Hola, <strong>${inv.nombre}</strong> (${puesto}). Crea tu contraseña para entrar.</p>
      <form id="form-inv" class="form">
        <label>Contraseña<input name="clave" type="password" autocomplete="new-password" minlength="8" required placeholder="mín. 8, letras y números"></label>
        <label>Repite la contraseña<input name="otra" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn btn-primario" type="submit">Guardar contraseña</button>
      </form></section></main>`;
  $('#form-inv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.clave !== f.otra) return aviso('Las contraseñas no son iguales', 'error');
    try {
      await api.post(`/api/publico/invitacion/${encodeURIComponent(token)}`, { clave: f.clave });
      guardar('colegia:colegio', inv.slug);
      history.replaceState(null, '', `/entrar?c=${inv.slug}`);
      await pantallaIngreso('✅ Listo. Ahora entra con tu correo y tu nueva contraseña.');
    } catch (er) { aviso(er.message, 'error'); }
  });
}

function armarMarco() {
  const { usuario, colegio } = sesion;
  const items = MENU.filter((m) => (m.permiso ? puede(m.permiso) : m.ver ? m.ver(sesion) : true));
  $('#app').innerHTML = html`
    <div class="marco">
      <aside class="lateral" id="lateral">
        <div class="lateral-marca">
          ${colegio.logo ? html`<img src="${colegio.logo}" alt="" class="logo">` : html`<div class="logo-letra">${colegio.nombre[0]}</div>`}
          <div><strong>${colegio.nombre}</strong><span>ColegIA</span></div>
        </div>
        <nav aria-label="Menú principal">
          ${items.map((m) => html`<a href="#/${m.ruta}" data-ruta="${m.ruta}">${crudo(icono(m.icono))}<span>${m.texto}</span>${m.ruta === 'chat' ? crudo('<b class="insignia" id="ins-chat" hidden></b>') : ''}</a>`)}
        </nav>
        <div class="lateral-pie">
          <div id="instalar-menu"></div>
          <div class="usuario"><strong>${usuario.nombre}</strong><span>${usuario.rol_nombre}</span></div>
          <button class="btn btn-fantasma" id="salir">Cerrar sesión</button>
        </div>
      </aside>
      <div class="contenido">
        <header class="barra">
          <button class="btn-menu" id="abrir-menu" aria-label="Abrir menú">☰<b class="insignia insignia-menu" id="ins-menu" hidden></b></button>
          <span class="barra-titulo" id="barra-titulo"></span>
          ${colegio.es_demo ? html`<span class="etiqueta etiqueta-demo">Demo</span>` : ''}
        </header>
        <main id="vista" tabindex="-1"></main>
        <nav class="tabs" aria-label="Chat y panel">
          <a href="#/chat" data-tab="chat">${crudo(ICONO_TAB_CHAT)}<span>Chat</span><b class="insignia" id="ins-tab" hidden></b></a>
          <a href="#/mipanel" data-tab="mipanel">${crudo(icono('panel'))}<span>Mi panel</span></a>
        </nav>
      </div>
    </div>`;
  $('#salir').addEventListener('click', async () => {
    await api.post('/api/logout').catch(() => {});
    location.hash = '';
    pantallaIngreso();
  });
  $('#abrir-menu').addEventListener('click', () => $('#lateral').classList.toggle('abierto'));
  iniciarInsignia();
  import('./pwa.js').then((m) => { m.botonInstalar($('#instalar-menu'), { clase: 'btn-instalar btn-instalar-menu' }); m.botonAvisos($('#instalar-menu'), { clase: 'btn-instalar btn-instalar-menu btn-avisos' }); m.asegurarAvisos(); }).catch(() => {});
}

// Contador de mensajes sin leer del chat (como en WhatsApp): en el menú, en el título y en el ícono de la app
let temporizadorInsignia = null;
function pintarInsignia(n) {
  for (const id of ['ins-chat', 'ins-menu', 'ins-tab']) {
    const b = document.getElementById(id);
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = n < 1; }
  }
  document.title = n > 0 ? `(${n}) ColegIA` : 'ColegIA';
  try { if (n > 0) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch { /* sin soporte */ }
}
async function actualizarInsignia() {
  if (!sesion.usuario) return;
  try { pintarInsignia(location.hash.startsWith('#/chat') && !document.hidden ? 0 : (await api.get('/api/chat/no-leidos')).n); } catch { /* sin conexión */ }
}
function iniciarInsignia() {
  clearInterval(temporizadorInsignia);
  temporizadorInsignia = setInterval(() => { if (!document.hidden) actualizarInsignia(); }, 30000);
  window.addEventListener('colegia:leido', () => pintarInsignia(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizarInsignia(); });
  actualizarInsignia();
}

let rutaActual = null;
async function enrutar() {
  const [nombre0, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const nombre = nombre0 || 'chat';
  const cargador = VISTAS[nombre] || VISTAS.inicio;
  rutaActual = location.hash;
  const activa = !VISTAS[nombre] || nombre === 'alumno' ? 'inicio' : nombre;
  document.querySelectorAll('.lateral nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === activa));
  $('#lateral')?.classList.remove('abierto');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === (nombre === 'chat' ? 'chat' : 'mipanel')));
  // Elemento nuevo en cada navegación: así no se acumulan eventos de la vista anterior
  const anterior = $('#vista');
  const vista = anterior.cloneNode(false);
  vista.classList.toggle('vista-chat', nombre === 'chat');
  anterior.replaceWith(vista);
  const item = MENU.find((m) => m.ruta === nombre);
  $('#barra-titulo').textContent = nombre === 'alumno' ? 'Ficha 360 del alumno' : nombre === 'mipanel' ? 'Mi panel' : item?.texto || '';
  vista.innerHTML = '<div class="cargando"><span class="spinner"></span>Cargando…</div>';
  try {
    const modulo = await cargador();
    if (rutaActual !== location.hash) return;
    await modulo.mostrar(vista, resto, sesion);
    vista.focus({ preventScroll: true });
  } catch (e) {
    vista.innerHTML = html`<div class="vacio">${e.message || 'No se pudo cargar esta sección'}</div>`;
  }
}

async function iniciar() {
  // Desde «Instalar la app» siempre se muestra el registro/ingreso, aunque el celular ya tenga una sesión
  if (new URLSearchParams(location.search).has('instalar') && !sesion.usuario) return pantallaIngreso();
  try {
    Object.assign(sesion, await api.get('/api/yo'));
  } catch {
    return pantallaIngreso();
  }
  aplicarMarca(sesion.colegio);
  armarMarco();
  window.onhashchange = enrutar;
  enrutar();
  import('./pwa.js').then((m) => m.ofrecerInstalacion()).catch(() => {});
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-imprimir]')) print(); });

window.addEventListener('colegia:sesion-vencida', () => {
  if (sesion.usuario) { sesion.usuario = null; pantallaIngreso('Tu sesión venció. Vuelve a ingresar.'); }
});

if (location.pathname.startsWith('/privacidad')) {
  import('./vistas/privacidad.js').then((m) => m.mostrar($('#app')));
} else {
  iniciar();
}

