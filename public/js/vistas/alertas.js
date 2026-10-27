// Alerta temprana: alumnos en riesgo (faltas, notas bajas, tutor IA, exámenes) y temas
// donde los alumnos se traban con el tutor. Lo mismo llega por WhatsApp cada lunes.
import { api } from '../api.js';
import { html, crudo, cargando, vacio } from '../ui.js';

export async function mostrar(vista) {
  vista.innerHTML = cargando('Calculando alertas…');
  const { riesgo, tutor } = await api.get('/api/alertas');
  const aulas = {};
  for (const a of riesgo) aulas[`${a.grado} ${a.seccion}`] = (aulas[`${a.grado} ${a.seccion}`] || 0) + 1;
  const max = Math.max(1, ...Object.values(aulas));
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Alertas tempranas</h1>
      <p>Para actuar antes de que el alumno desapruebe. Reglas: 4 o más faltas en 2 meses, notas bajas en 2 o más cursos, se trabó 3 veces con el tutor IA o falló la mitad de un examen. Cada lunes los tutores reciben su lista por WhatsApp.</p></div></div>
    <div class="rejilla-2">
      <section class="tarjeta"><div class="tarjeta-titulo"><h2>${riesgo.length} alumnos en riesgo</h2></div>
        ${riesgo.length ? crudo(html`<div class="tabla-caja"><table><thead><tr><th>Alumno</th><th>Aula</th><th>Motivos</th></tr></thead>
          <tbody>${riesgo.map((a) => html`<tr><td><a href="#/alumno/${a.id}">${a.apellidos}, ${a.nombres}</a></td><td>${a.grado} ${a.seccion}</td><td>${a.motivos.join(' · ')}</td></tr>`)}</tbody></table></div>`)
          : vacio('Sin alumnos en riesgo con las reglas actuales.')}
      </section>
      <div>
        <section class="tarjeta"><h2>Por aula</h2>
          <div class="barras-h">${Object.entries(aulas).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<div class="barra-h"><span>${k}</span><div class="riel"><div class="relleno" style="width:${(n / max) * 100}%"></div></div><span class="num">${n}</span></div>`)}</div>
          ${Object.keys(aulas).length ? '' : crudo('<p class="pequeno">—</p>')}
        </section>
        <section class="tarjeta"><h2>Tutor IA: dónde se traban</h2>
          ${tutor.length ? crudo(html`<ul class="lista-actividad">${tutor.map((t) => html`<li><span>${t.tema} <span class="pequeno">${t.curso || ''} · ${t.grado} ${t.seccion}</span></span><span class="pequeno">${t.alumnos} alumno(s) · ${t.trabados} trabas</span></li>`)}</ul>`)
            : crudo('<p class="pequeno">Aún no hay uso del tutor IA en los últimos 30 días.</p>')}
        </section>
      </div>
    </div>`;
}
