// Pagos (morosos, por vencer, pagados) y envío de recordatorios por WhatsApp.
import { api } from '../api.js';
import { html, crudo, $, $$, soles, fecha, cargando, vacio, aviso, conBoton } from '../ui.js';
import { puede } from '../app.js';
import { registrarPago } from './ficha.js';

const PESTANAS = [
  ['vencidos', 'Morosos'], ['proximos', 'Por vencer (15 días)'], ['pagados', 'Pagados'], ['recordatorios', 'Recordatorios'],
];

export async function mostrar(vista, [pestana = 'vencidos']) {
  const visibles = PESTANAS.filter(([k]) => k !== 'recordatorios' || puede('recordatorios.enviar'));
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Pagos y recordatorios</h1><p>Pensiones del año escolar y avisos de cobranza por WhatsApp.</p></div></div>
    <div class="pestanas" role="tablist">${visibles.map(([k, t]) => html`<button role="tab" data-p="${k}" class="${k === pestana ? 'activo' : ''}">${t}</button>`)}</div>
    <div id="panel-pagos"></div>`;
  $('.pestanas', vista).addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b) location.hash = `#/pagos/${b.dataset.p}`;
  });
  const caja = $('#panel-pagos', vista);
  if (pestana === 'recordatorios') return recordatorios(caja);
  return listaPagos(caja, pestana);
}

async function listaPagos(caja, filtro) {
  caja.innerHTML = cargando();
  const grados = await api.get('/api/grados');
  const dibujar = async (grado = '') => {
    const { pagos } = await api.get(`/api/pagos?filtro=${filtro}&grado=${encodeURIComponent(grado)}`);
    const total = pagos.reduce((s, p) => s + p.monto_centimos, 0);
    const alumnos = new Set(pagos.map((p) => p.alumno_id)).size;
    $('#tabla-pagos', caja).innerHTML = pagos.length ? html`
      <p><strong>${pagos.length}</strong> cuotas · <strong>${alumnos}</strong> alumnos · total <strong>${soles(total)}</strong></p>
      <div class="tabla-caja"><table>
        <thead><tr><th>Alumno</th><th>Grado</th><th>Concepto</th><th>Vence</th><th class="num">Monto</th>
          <th>${filtro === 'pagados' ? 'Pagado' : 'Último recordatorio'}</th>${puede('pagos.editar') ? crudo('<th></th>') : ''}</tr></thead>
        <tbody>${pagos.map((p) => html`<tr>
          <td><a href="#/alumno/${p.alumno_id}">${p.apellidos}, ${p.nombres}</a></td><td>${p.grado} ${p.seccion}</td>
          <td>${p.concepto}</td><td>${fecha(p.vencimiento)}</td><td class="num">${soles(p.monto_centimos)}</td>
          <td>${filtro === 'pagados' ? `${fecha(p.pagado_en)} · ${p.medio || ''}` : p.ultimo_recordatorio ? fecha(p.ultimo_recordatorio, true) : '—'}</td>
          ${puede('pagos.editar') ? crudo(html`<td>${p.estado === 'pendiente' ? crudo(html`<button class="btn btn-chico" data-pagar="${p.id}">Registrar pago</button>`) : crudo(html`<button class="btn btn-chico btn-fantasma" data-revertir="${p.id}">Revertir</button>`)}</td>`) : ''}
        </tr>`)}</tbody></table></div>` : vacio(filtro === 'vencidos' ? 'No hay cuotas vencidas. 🎉' : 'No hay cuotas en esta lista.');
  };
  caja.innerHTML = html`
    <div class="acciones" style="margin-bottom:12px">
      <select id="grado" style="max-width:220px" aria-label="Filtrar por grado"><option value="">Todos los grados</option>
        ${[...new Set(grados.map((g) => g.grado))].map((g) => html`<option>${g}</option>`)}</select>
    </div>
    <div id="tabla-pagos">${cargando()}</div>`;
  $('#grado', caja).addEventListener('change', (e) => dibujar(e.target.value));
  caja.addEventListener('click', async (e) => {
    const pagar = e.target.closest('[data-pagar]');
    if (pagar) registrarPago(pagar.dataset.pagar, () => dibujar($('#grado', caja).value));
    const rev = e.target.closest('[data-revertir]');
    if (rev && confirm('¿Revertir este pago? La cuota volverá a quedar pendiente.')) {
      await conBoton(rev, async () => { await api.post(`/api/pagos/${rev.dataset.revertir}/anular-pago`); aviso('Pago revertido'); dibujar($('#grado', caja).value); });
    }
  });
  dibujar();
}

async function recordatorios(caja, tipo = 'vencido') {
  caja.innerHTML = cargando();
  const d = await api.get(`/api/recordatorios?tipo=${tipo}`);
  const limite = new Date(Date.now() - d.dias_entre * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const enviable = (c) => c.telefono && c.consiente === 1 && !(c.ultimo_recordatorio && c.ultimo_recordatorio > limite);
  const motivo = (c) => (!c.telefono ? 'Sin celular' : c.consiente === 1 ? (enviable(c) ? '' : `Ya se envió (${fecha(c.ultimo_recordatorio)})`)
    : c.consiente === 0 ? 'No autorizó WhatsApp' : 'Falta autorización');
  const nEnviables = d.cuotas.filter(enviable).length;

  caja.innerHTML = html`
    <div class="rejilla-2">
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Cuotas para recordar</h2>
          <div class="modo-chat"><button data-tipo="vencido" class="${tipo === 'vencido' ? 'activo' : ''}">Vencidas</button><button data-tipo="previo" class="${tipo === 'previo' ? 'activo' : ''}">Vencen en ${d.ajustes.recordatorio_dias_antes} días</button></div></div>
        ${d.cuotas.length ? crudo(html`
          <div class="acciones" style="margin-bottom:10px">
            <label class="check"><input type="checkbox" id="todas" checked> Seleccionar las ${nEnviables} que se pueden enviar</label>
            <button class="btn btn-primario" id="enviar">Enviar recordatorios</button>
          </div>
          <div class="progreso oculto" id="barra"><div></div></div>
          <div class="tabla-caja" style="max-height:520px"><table>
            <thead><tr><th></th><th>Apoderado</th><th>Alumno</th><th>Cuota</th><th class="num">Monto</th><th>Vence</th><th>Estado</th></tr></thead>
            <tbody>${d.cuotas.map((c) => html`<tr>
              <td><input type="checkbox" class="sel" value="${c.pago_id}" ${enviable(c) ? 'checked' : 'disabled'} aria-label="Seleccionar"></td>
              <td>${c.apoderado_nombres} ${c.apoderado_apellidos}</td><td><a href="#/alumno/${c.alumno_id}">${c.alumno_nombres} ${c.alumno_apellidos}</a> <span class="pequeno">${c.grado}</span></td>
              <td>${c.concepto}</td><td class="num">${soles(c.monto_centimos)}</td><td>${fecha(c.vencimiento)}</td>
              <td>${motivo(c) ? crudo(html`<span class="etiqueta ${c.consiente === 0 ? 'etiqueta-peligro' : 'etiqueta-alerta'}">${motivo(c)}</span>`) : crudo('<span class="etiqueta etiqueta-ok">Listo</span>')}</td>
            </tr>`)}</tbody></table></div>`) : vacio('No hay cuotas en este grupo.')}
      </section>
      <div>
        <section class="tarjeta"><h2>Cómo funciona</h2>
          <ul class="pequeno" style="padding-left:18px;margin:0">
            <li>Solo se envía a apoderados que <strong>autorizaron WhatsApp</strong> (Ley 29733).</li>
            <li>Máximo un recordatorio por cuota cada ${d.dias_entre} días.</li>
            <li>Modo actual: <strong>${d.ajustes.wa_modo === 'cloud' ? 'WhatsApp real (Cloud API)' : 'simulado'}</strong>. ${d.ajustes.wa_modo === 'cloud' ? '' : crudo('Los mensajes aparecen en el <a href="#/whatsapp">chat de prueba</a>.')}</li>
            <li>Envío automático: <strong>${d.ajustes.recordatorio_auto ? 'activado' : 'desactivado'}</strong> (todos los días desde las 8 a. m.). ${puede('ajustes.editar') ? crudo('<a href="#/ajustes">Cambiar</a>') : ''}</li>
          </ul>
          ${d.cuotas[0] ? crudo(html`<p class="pequeno" style="margin-top:10px"><strong>Ejemplo del mensaje:</strong></p>
            <div class="burbuja propia" style="max-width:100%">Hola ${d.cuotas[0].apoderado_nombres}, le recordamos que la cuota *${d.cuotas[0].concepto}* de ${d.cuotas[0].alumno_nombres} por ${soles(d.cuotas[0].monto_centimos)} ${tipo === 'vencido' ? 'venció' : 'vence'} el ${fecha(d.cuotas[0].vencimiento)}…</div>`) : ''}
        </section>
        <section class="tarjeta"><h2>Últimos enviados</h2>
          ${d.historial.length ? crudo(html`<ul class="lista-actividad">${d.historial.map((h) => html`<li><span>${h.alumno} · ${h.concepto} <span class="pequeno">${h.origen === 'automatico' ? 'auto' : 'manual'} · ${h.canal || ''}${h.estado === 'error' ? ' · error' : ''}</span></span><span class="pequeno">${fecha(h.creado_en, true)}</span></li>`)}</ul>`) : crudo('<p class="pequeno">Aún no se envían recordatorios.</p>')}
        </section>
      </div>
    </div>`;

  $$('[data-tipo]', caja).forEach((b) => b.addEventListener('click', () => recordatorios(caja, b.dataset.tipo)));
  $('#todas', caja)?.addEventListener('change', (e) => $$('.sel:not(:disabled)', caja).forEach((c) => { c.checked = e.target.checked; }));
  $('#enviar', caja)?.addEventListener('click', (e) => conBoton(e.target, async () => {
    const ids = $$('.sel:checked', caja).map((c) => Number(c.value));
    if (!ids.length) return aviso('Selecciona al menos una cuota', 'error');
    const barra = $('#barra', caja);
    barra.classList.remove('oculto');
    const total = { enviados: 0, simulados: 0, errores: 0, omitidos: 0 };
    for (let i = 0; i < ids.length; i += 40) {
      const r = await api.post('/api/recordatorios/enviar', { pago_ids: ids.slice(i, i + 40) });
      total.enviados += r.enviados; total.simulados += r.simulados; total.errores += r.errores;
      total.omitidos += r.sin_consentimiento + r.sin_telefono + r.recientes;
      barra.firstElementChild.style.width = `${Math.min(100, ((i + 40) / ids.length) * 100)}%`;
    }
    aviso(`Listo: ${total.enviados} enviados por WhatsApp, ${total.simulados} simulados, ${total.errores} con error, ${total.omitidos} omitidos.`);
    recordatorios(caja, tipo);
  }));
}
