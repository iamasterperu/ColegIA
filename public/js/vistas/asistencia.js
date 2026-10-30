// Toma de lista: el profesor marca presentes, faltas y tardanzas de su sección. Queda registrada
// día por día y llega a dirección en el reporte diario.
import { api } from '../api.js';
import { html, crudo, $, $$, cargando, vacio, aviso, conBoton } from '../ui.js';
import { puede } from '../app.js';

export async function mostrar(vista) {
  vista.innerHTML = html`<div class="encabezado"><div><h1>Asistencia</h1><p>Toma la lista de tu sección. Los padres de los ausentes reciben un aviso y dirección ve el resumen del día.</p></div></div><div id="cont">${cargando()}</div>`;
  const { secciones, fecha } = await api.get('/api/asistencia/secciones');
  const cont = $('#cont', vista);
  const resumen = puede('asistencia.ver') ? await api.get('/api/asistencia/dia') : null;
  cont.innerHTML = html`
    ${resumen ? html`<section class="tarjeta"><h2>Hoy</h2><p>✅ ${resumen.presentes} presentes · ❌ ${resumen.faltas} faltas · ⏰ ${resumen.tardanzas} tardanzas</p>
      ${resumen.sinLista.length ? html`<p class="pequeno">⚠️ Sin tomar lista: ${resumen.sinLista.map((s) => `${s.grado} ${s.seccion}`).join(', ')}</p>` : ''}</section>` : ''}
    <section class="tarjeta"><h2>Tomar lista</h2>
      ${secciones.length ? html`<form class="form" id="f-sel"><label>Sección<select name="sec">${secciones.map((s) => html`<option value="${s.grado}|${s.seccion}">${s.grado} ${s.seccion} (${s.alumnos} alumnos)</option>`)}</select></label>
        <label>Fecha<input type="date" name="fecha" value="${fecha}" max="${fecha}"></label><button class="btn btn-primario">Ver lista</button></form><div id="lista"></div>` : vacio('No tienes secciones asignadas. Pídele a dirección que te las asigne.')}</section>`;
  const sel = $('#f-sel', vista);
  if (!sel) return;
  sel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(sel));
    const [grado, seccion] = d.sec.split('|');
    const { alumnos, tomada } = await api.get(`/api/asistencia/lista?grado=${encodeURIComponent(grado)}&seccion=${encodeURIComponent(seccion)}&fecha=${d.fecha}`);
    $('#lista', vista).innerHTML = html`<p class="pequeno">${tomada ? 'Ya se tomó lista este día; puedes corregirla.' : 'Por defecto todos están presentes.'}</p>
      <div class="tabla-caja"><table><thead><tr><th>Alumno</th><th>Presente</th><th>Falta</th><th>Tarde</th></tr></thead><tbody>
      ${alumnos.map((a) => html`<tr><td>${a.apellidos} ${a.nombres}</td>${['presente', 'falta', 'tardanza'].map((est) => html`<td><input type="radio" name="a${a.id}" value="${est}" aria-label="${est}" ${a.estado === est ? crudo('checked') : ''}></td>`)}</tr>`)}
      </tbody></table></div><p><button class="btn btn-primario" id="guardar">Guardar lista</button></p>`;
    $('#guardar', vista).addEventListener('click', (ev) => conBoton(ev.target, async () => {
      const registros = alumnos.map((a) => ({ alumno_id: a.id, estado: ($(`input[name="a${a.id}"]:checked`, vista) || {}).value || 'presente' }));
      const r = await api.post('/api/asistencia/lista', { grado, seccion, fecha: d.fecha, registros });
      aviso(`Lista guardada: ${r.presentes} presentes`);
    }));
  });
}
