// Inicio: buscador de alumnos (personal) o tarjetas de los hijos (padres).
import { api } from '../api.js';
import { html, $, debounce, cargando, vacio } from '../ui.js';
import { icono } from '../app.js';

const tarjetaAlumno = (a) => html`
  <a class="resultado" href="#/alumno/${a.id}">
    <div class="avatar">${a.nombres[0]}${a.apellidos[0] || ''}</div>
    <div><strong>${a.apellidos}, ${a.nombres}</strong>
      <div class="meta">${a.grado} · Sección ${a.seccion} · Código ${a.codigo}${a.estado !== 'matriculado' ? ` · ${a.estado}` : ''}</div></div>
  </a>`;

export async function mostrar(vista, _, sesion) {
  const rol = sesion.usuario.rol;
  if (rol === 'padre') {
    vista.innerHTML = cargando();
    const { alumnos } = await api.get('/api/alumnos');
    vista.innerHTML = html`
      <div class="encabezado"><div><h1>Hola, ${sesion.usuario.nombre.split(' ')[0]}</h1>
        <p>Elige a tu hijo(a) para ver su ficha, notas, pagos y lista de útiles.</p></div></div>
      <div class="resultados">${alumnos.length ? alumnos.map(tarjetaAlumno) : ''}</div>
      ${alumnos.length ? '' : vacio('No hay alumnos vinculados a tu cuenta. Comunícate con secretaría.')}
      <p class="pequeno" style="margin-top:16px">Revisa y cambia tus autorizaciones de datos en <a href="#/datos">Protección de datos</a>.</p>`;
    return;
  }

  const grados = await api.get('/api/grados');
  const opciones = [...new Set(grados.map((g) => g.grado))];
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Ficha 360 del alumno</h1>
      <p>Busca por nombre o apellido. ${rol === 'profesor' ? 'Ves solo a los alumnos de tus secciones.' : ''}</p></div>
      <select id="filtro-grado" aria-label="Filtrar por grado" style="max-width:220px">
        <option value="">Todos los grados</option>${opciones.map((g) => html`<option>${g}</option>`)}
      </select></div>
    <div class="buscador"><input id="q" type="search" placeholder="Ej.: Quispe, Valentina…" autocomplete="off" aria-label="Buscar alumno"></div>
    <div id="resultados" class="resultados"></div>`;
  $('.buscador', vista).insertAdjacentHTML('afterbegin', icono('buscar'));
  const q = $('#q', vista);
  const filtro = $('#filtro-grado', vista);
  const caja = $('#resultados', vista);

  const buscar = async () => {
    const texto = q.value.trim();
    if (texto.length < 2 && !filtro.value && rol !== 'profesor') {
      caja.innerHTML = vacio('Escribe al menos 2 letras del nombre o elige un grado.');
      return;
    }
    caja.innerHTML = cargando('Buscando…');
    const params = new URLSearchParams({ q: texto.length >= 2 ? texto : '', grado: filtro.value });
    const { alumnos } = await api.get(`/api/alumnos?${params}`);
    caja.innerHTML = alumnos.length ? alumnos.map(tarjetaAlumno).join('') : vacio('No encontramos alumnos con ese nombre.');
  };
  q.addEventListener('input', debounce(buscar, 350));
  filtro.addEventListener('change', buscar);
  q.focus();
  buscar();
}
