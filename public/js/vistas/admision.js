// Admisiones: familias interesadas que escribieron por WhatsApp y visitas agendadas.
import { api } from '../api.js';
import { html, crudo, $, $$, fecha, cargando, vacio, aviso } from '../ui.js';

const ESTADOS = { nuevo: 'Nuevo', contactado: 'Contactado', matriculado: 'Matriculado', descartado: 'Descartado' };
const VISITAS = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' };

export async function mostrar(vista) {
  vista.innerHTML = html`<div class="encabezado"><div><h1>Admisiones</h1><p>Familias que preguntaron por WhatsApp y visitas agendadas. Solo se guarda lo que la familia escribe voluntariamente.</p></div></div><div id="cont">${cargando()}</div>`;
  const cargar = async () => {
    const { leads, visitas } = await api.get('/api/admision');
    const sel = (mapa, actual, clase, id) => html`<select class="${clase}" data-id="${id}" aria-label="Estado">${Object.entries(mapa).map(([k, t]) => html`<option value="${k}" ${k === actual ? crudo('selected') : ''}>${t}</option>`)}</select>`;
    $('#cont', vista).innerHTML = html`
      <section class="tarjeta"><h2>Visitas (${visitas.length})</h2>
        ${visitas.length ? html`<div class="tabla-caja"><table><thead><tr><th>Familia</th><th>Celular</th><th>Grado</th><th>Horario</th><th>Estado</th></tr></thead><tbody>
          ${visitas.map((v) => html`<tr><td>${v.nombre}</td><td>${v.telefono}</td><td>${v.grado || ''}</td><td>${v.horario}</td><td>${sel(VISITAS, v.estado, 'est-visita', v.id)}</td></tr>`)}</tbody></table></div>` : vacio('Aún no hay visitas agendadas.')}</section>
      <section class="tarjeta"><h2>Interesados (${leads.length})</h2>
        ${leads.length ? html`<div class="tabla-caja"><table><thead><tr><th>Nombre</th><th>Celular</th><th>Grado</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>
          ${leads.map((l) => html`<tr><td>${l.nombre}</td><td>${l.telefono}</td><td>${l.grado || ''}</td><td>${fecha(l.creado_en, true)}</td><td>${sel(ESTADOS, l.estado, 'est-lead', l.id)}</td></tr>`)}</tbody></table></div>` : vacio('Cuando una familia escriba al número del colegio, aparecerá aquí.')}</section>`;
    $$('.est-lead', vista).forEach((s) => s.addEventListener('change', async () => { await api.put(`/api/admision/leads/${s.dataset.id}`, { estado: s.value }); aviso('Estado actualizado'); }));
    $$('.est-visita', vista).forEach((s) => s.addEventListener('change', async () => { await api.put(`/api/admision/visitas/${s.dataset.id}`, { estado: s.value }); aviso('Estado actualizado'); }));
  };
  await cargar();
}
