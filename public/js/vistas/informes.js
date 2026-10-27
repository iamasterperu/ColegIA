// Información que responde el asistente de WhatsApp y checklist de la demo de 30 días.
import { api } from '../api.js';
import { html, crudo, $, $$, cargando, aviso, conBoton } from '../ui.js';

export async function mostrar(vista) {
  vista.innerHTML = html`<div class="encabezado"><div><h1>Información del colegio</h1><p>El asistente responde solo con lo que escribas aquí. Es información que el colegio ya comparte con las familias.</p></div></div><div id="cont">${cargando()}</div>`;
  const [inf, demo] = await Promise.all([api.get('/api/informes'), api.get('/api/demo')]);
  const faqLinea = (f = { palabras: '', respuesta: '' }) => html`<div class="faq" style="display:grid;gap:6px;margin-bottom:10px"><input class="fp" placeholder="Palabras clave (ej: uniforme)" value="${f.palabras}" aria-label="Palabras clave"><textarea class="fr" rows="2" placeholder="Respuesta aprobada por el colegio" aria-label="Respuesta">${f.respuesta}</textarea></div>`;
  $('#cont', vista).innerHTML = html`
    <section class="tarjeta"><h2>Demo de 30 días ${demo.dias_restantes != null ? crudo(html`<span class="etiqueta">${demo.dias_restantes} días restantes</span>`) : ''}</h2>
      <p class="pequeno">Se pide solo información pública. No se piden listas de alumnos, datos de padres, notas, DNI ni claves.</p>
      <form class="form" id="f-demo">
        <label>RUC del colegio<input name="ruc" inputmode="numeric" maxlength="11" value="${demo.ruc || ''}" placeholder="11 números"></label>
        <label>Fecha de inicio de la demo<input type="date" name="inicio" value="${demo.inicio || ''}"></label>
        ${demo.pasos.map((p) => html`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${p.clave}" ${demo.checklist[p.clave] ? crudo('checked') : ''}> ${p.texto}</label>`)}
        <button class="btn btn-primario">Guardar</button></form></section>
    <section class="tarjeta"><h2>Respuestas del asistente</h2>
      <form class="form" id="f-info">
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="adm-activa"> Atender por WhatsApp a familias que aún no están registradas (admisiones)</label>
        ${Object.entries(inf.claves).map(([k, t]) => html`<label>${t}<textarea name="${k}" rows="3">${inf.info[k] || ''}</textarea></label>`)}
        <h3>Preguntas frecuentes</h3><div id="faqs">${inf.faq.map(faqLinea)}</div>
        <p><button type="button" class="btn" id="mas-faq">Añadir pregunta</button></p>
        <button class="btn btn-primario">Guardar información</button></form></section>`;
  $('#adm-activa', vista).checked = inf.info.admision_activa === '1';
  $('#mas-faq', vista).addEventListener('click', () => $('#faqs', vista).insertAdjacentHTML('beforeend', faqLinea().toString()));
  $('#f-info', vista).addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    const faq = $$('.faq', vista).map((d) => ({ palabras: $('.fp', d).value, respuesta: $('.fr', d).value }));
    await conBoton($('.btn-primario', e.target), async () => {
      await api.put('/api/informes', { info: Object.fromEntries(Object.keys(inf.claves).map((k) => [k, datos[k] || ''])), faq, admision_activa: $('#adm-activa', vista).checked });
      aviso('Información guardada');
    });
  });
  $('#f-demo', vista).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await conBoton($('.btn-primario', e.target), async () => {
      await api.put('/api/demo', { ruc: d.ruc, inicio: d.inicio, checklist: Object.fromEntries(demo.pasos.map((p) => [p.clave, d[p.clave] === 'on'])) });
      aviso('Demo actualizada');
    });
  });
}
