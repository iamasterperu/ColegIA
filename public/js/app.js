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
export const icono = (n) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;

const MENU = [
  { ruta: 'inicio', texto: 'Buscar alumno', icono: 'buscar', ver: (s) => s.usuario.rol !== 'padre' },
  { ruta: 'inicio', texto: 'Mis hijos', icono: 'familia', ver: (s) => s.usuario.rol === 'padre' },
  { ruta: 'panel', texto: 'Panel de dirección', icono: 'panel', permiso: 'panel.ver' },
  { ruta: 'docente', texto: 'Asistente docente', icono: 'docente', ver: (s) => ['direccion', 'profesor', 'secretaria'].includes(s.usuario.rol) },
  { ruta: 'asistencia', texto: 'Asistencia (tomar lista)', icono: 'docente', permiso: 'asistencia.tomar' },
  { ruta: 'automatizacion', texto: 'Automatización y reportes', icono: 'panel', permiso: 'comunicados.aprobar' },
  { ruta: 'alertas', texto: 'Alertas tempranas', icono: 'alerta', ver: (s) => ['direccion', 'profesor', 'secretaria'].includes(s.usuario.rol) },
  { ruta: 'pagos', texto: 'Pagos y recordatorios', icono: 'pagos', permiso: 'pagos.ver' },
  { ruta: 'utiles', texto: 'Listas de útiles', icono: 'utiles', permiso: 'utiles.ver' },
  { ruta: 'whatsapp', texto: 'WhatsApp', icono: 'whatsapp', permiso: 'whatsapp.ver' },
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
  document.title = `${c.nombre} · ColegIA`;
}

async function pantallaIngreso(mensaje) {
  const app = $('#app');
  const params = new URLSearchParams(location.search);
  let slug = (params.get('c') || leer('colegia:colegio') || 'sanmartin').toLowerCase();
  let colegio = null;
  try { colegio = await api.get(`/api/publico/colegio/${encodeURIComponent(slug)}`); } catch { colegio = null; }
  let demos = [];
  try { demos = await api.get('/api/publico/colegios-demo'); } catch { /* sin demos */ }
  if (colegio) aplicarMarca(colegio);

  app.innerHTML = html`
    <main class="ingreso">
      <section class="ingreso-caja">
        <div class="ingreso-marca">
          ${colegio?.logo ? html`<img src="${colegio.logo}" alt="" class="logo-grande">` : html`<div class="logo-letra">${(colegio?.nombre || 'C')[0]}</div>`}
          <div><p class="sobretitulo">ColegIA</p><h1>${colegio?.nombre || 'Ingresa a tu colegio'}</h1></div>
        </div>
        ${mensaje ? html`<p class="alerta">${mensaje}</p>` : ''}
        <form id="form-ingreso" class="form">
          <label>Código del colegio<input name="colegio" value="${slug}" autocomplete="organization" required></label>
          <label>Correo<input name="email" type="email" autocomplete="username" required></label>
          <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primario" type="submit">Ingresar</button>
        </form>
        ${colegio?.usuarios_demo?.length ? html`
          <div class="demo-caja">
            <p><strong>Colegio de demostración.</strong> Entra con un rol (contraseña <code>demo1234</code>):</p>
            <div class="chips">${colegio.usuarios_demo.map((u) => html`<button class="chip" data-demo="${u.email}">${ROL_NOMBRE[u.rol]}</button>`)}</div>
            ${demos.length > 1 ? html`<p class="pequeno">Otros colegios demo: ${demos.filter((d) => d.slug !== slug).map((d) => html`<a href="?c=${d.slug}">${d.nombre}</a> `)}</p>` : ''}
          </div>` : ''}
        <p class="pequeno"><a href="/privacidad?c=${slug}">Aviso de privacidad</a> · Tus datos están protegidos según la Ley 29733.</p>
      </section>
    </main>`;

  const form = $('#form-ingreso');
  const entrar = async (datos) => {
    const boton = form.querySelector('button');
    boton.disabled = true;
    try {
      await api.post('/api/login', datos);
      guardar('colegia:colegio', datos.colegio.trim().toLowerCase());
      if (params.has('c')) history.replaceState(null, '', '/');
      await iniciar();
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    entrar(Object.fromEntries(new FormData(form)));
  });
  form.colegio.addEventListener('change', () => {
    const nuevo = form.colegio.value.trim().toLowerCase();
    if (nuevo && nuevo !== slug) { slug = nuevo; history.replaceState(null, '', `?c=${encodeURIComponent(nuevo)}`); pantallaIngreso(); }
  });
  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]');
    if (b) entrar({ colegio: slug, email: b.dataset.demo, clave: 'demo1234' });
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
          ${items.map((m) => html`<a href="#/${m.ruta}" data-ruta="${m.ruta}">${crudo(icono(m.icono))}<span>${m.texto}</span></a>`)}
        </nav>
        <div class="lateral-pie">
          <div class="usuario"><strong>${usuario.nombre}</strong><span>${usuario.rol_nombre}</span></div>
          <button class="btn btn-fantasma" id="salir">Cerrar sesión</button>
        </div>
      </aside>
      <div class="contenido">
        <header class="barra">
          <button class="btn-menu" id="abrir-menu" aria-label="Abrir menú">☰</button>
          <span class="barra-titulo" id="barra-titulo"></span>
          ${colegio.es_demo ? html`<span class="etiqueta etiqueta-demo">Demo</span>` : ''}
          ${puede('whatsapp.ver') ? html`<span class="etiqueta ${colegio.wa_modo === 'cloud' ? 'etiqueta-ok' : ''}">WhatsApp: ${colegio.wa_modo === 'cloud' ? 'conectado' : 'simulado'}</span>` : ''}
        </header>
        <main id="vista" tabindex="-1"></main>
      </div>
    </div>`;
  $('#salir').addEventListener('click', async () => {
    await api.post('/api/logout').catch(() => {});
    location.hash = '';
    pantallaIngreso();
  });
  $('#abrir-menu').addEventListener('click', () => $('#lateral').classList.toggle('abierto'));
}

let rutaActual = null;
async function enrutar() {
  const [nombre = 'inicio', ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const cargador = VISTAS[nombre] || VISTAS.inicio;
  rutaActual = location.hash;
  const activa = !VISTAS[nombre] || nombre === 'alumno' ? 'inicio' : nombre;
  document.querySelectorAll('.lateral nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === activa));
  $('#lateral')?.classList.remove('abierto');
  // Elemento nuevo en cada navegación: así no se acumulan eventos de la vista anterior
  const anterior = $('#vista');
  const vista = anterior.cloneNode(false);
  anterior.replaceWith(vista);
  const item = MENU.find((m) => m.ruta === nombre);
  $('#barra-titulo').textContent = nombre === 'alumno' ? 'Ficha 360 del alumno' : item?.texto || '';
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
  try {
    Object.assign(sesion, await api.get('/api/yo'));
  } catch {
    return pantallaIngreso();
  }
  aplicarMarca(sesion.colegio);
  armarMarco();
  window.onhashchange = enrutar;
  enrutar();
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

