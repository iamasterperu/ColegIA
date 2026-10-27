// Registro de accesos: quién vio o cambió qué, cuándo y desde dónde.
import { api } from '../api.js';
import { html, crudo, $, fecha, cargando, vacio, ROL_NOMBRE, ACCIONES } from '../ui.js';

function detalle(d) {
  if (!d) return '';
  try {
    const o = JSON.parse(d);
    return Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
  } catch { return d; }
}

export async function mostrar(vista, [alumno]) {
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Registro de accesos</h1><p>Cada consulta de datos personales queda registrada. Solo dirección puede ver este registro.</p></div></div>
    <div class="acciones" style="margin-bottom:12px">
      <select id="accion" style="max-width:260px" aria-label="Acción"><option value="">Todas las acciones</option>
        ${Object.entries(ACCIONES).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select>
      <select id="rol" style="max-width:200px" aria-label="Rol"><option value="">Todos los roles</option>
        ${Object.entries(ROL_NOMBRE).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select>
      ${alumno ? crudo(html`<span class="etiqueta">Alumno #${alumno} <a href="#/auditoria">✕</a></span>`) : ''}
    </div>
    <div id="tabla">${cargando()}</div>`;
  let filas = [];
  const cargar = async (mas = false) => {
    const p = new URLSearchParams({ accion: $('#accion', vista).value, rol: $('#rol', vista).value });
    if (alumno) p.set('alumno', alumno);
    if (mas && filas.length) p.set('antes', filas[filas.length - 1].id);
    const nuevas = await api.get(`/api/auditoria?${p}`);
    filas = mas ? filas.concat(nuevas) : nuevas;
    $('#tabla', vista).innerHTML = filas.length ? html`<div class="tabla-caja"><table>
      <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Sobre</th><th>Detalle</th><th>IP</th></tr></thead>
      <tbody>${filas.map((a) => html`<tr>
        <td>${fecha(a.creado_en, true)}</td><td>${a.usuario_nombre || 'Sistema'}</td><td>${ROL_NOMBRE[a.rol] || a.rol || ''}</td>
        <td>${ACCIONES[a.accion] || a.accion}</td>
        <td>${a.alumno ? crudo(html`<a href="#/auditoria/${a.entidad_id}">${a.alumno}</a>`) : a.entidad ? `${a.entidad} ${a.entidad_id || ''}` : ''}</td>
        <td class="pequeno">${detalle(a.detalle)}</td><td class="pequeno">${a.ip || ''}</td></tr>`)}</tbody></table></div>
      ${nuevas.length === 100 ? crudo('<p><button class="btn" id="mas">Ver más</button></p>') : ''}` : vacio('Sin registros con esos filtros.');
    $('#mas', vista)?.addEventListener('click', () => cargar(true));
  };
  $('#accion', vista).addEventListener('change', () => cargar());
  $('#rol', vista).addEventListener('change', () => cargar());
  cargar();
}
