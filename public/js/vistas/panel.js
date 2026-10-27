// Panel de dirección: indicadores de matrícula, cobranza, deuda y cumplimiento.
import { api } from '../api.js';
import { html, crudo, $, soles, solesCorto, pct, fecha, mesNombre, cargando, ROL_NOMBRE, ACCIONES } from '../ui.js';

// Barras por mes: la pista clara es lo emitido y la barra lo cobrado (una sola serie).
function graficoMeses(meses) {
  const ancho = 640;
  const alto = 220;
  const izq = 54;
  const abajo = 26;
  const max = Math.max(...meses.map((m) => m.emitido), 1);
  const magnitud = 10 ** Math.floor(Math.log10(max));
  const tope = (Math.ceil((max / magnitud) * 2) / 2) * magnitud; // redondeo "bonito" hacia arriba
  const y = (v) => alto - abajo - (v / tope) * (alto - abajo - 10);
  const anchoGrupo = (ancho - izq) / meses.length;
  const anchoBarra = Math.min(36, anchoGrupo * 0.55);
  const lineas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const radio = 4;
  const barra = (x, v, clase) => {
    const top = y(v);
    const h = alto - abajo - top;
    if (h <= 0) return '';
    const r = Math.min(radio, h, anchoBarra / 2);
    return `<path class="${clase}" d="M${x},${alto - abajo} V${top + r} Q${x},${top} ${x + r},${top} H${x + anchoBarra - r} Q${x + anchoBarra},${top} ${x + anchoBarra},${top + r} V${alto - abajo} Z"/>`;
  };
  return `<svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Cobrado frente a emitido por mes">
    ${lineas.map((v) => `<line class="rejilla-linea" x1="${izq}" x2="${ancho}" y1="${y(v)}" y2="${y(v)}"/><text class="eje" x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${v ? (v / 100000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' mil' : '0'}</text>`).join('')}
    ${meses.map((m, i) => {
      const x = izq + i * anchoGrupo + (anchoGrupo - anchoBarra) / 2;
      const tasa = m.emitido ? m.cobrado / m.emitido : 0;
      return `<g data-tip="${mesNombre(m.periodo)}: cobrado ${soles(m.cobrado)} de ${soles(m.emitido)} (${pct(tasa)})">
        <rect x="${x - 6}" y="0" width="${anchoBarra + 12}" height="${alto - abajo}" fill="transparent"/>
        ${barra(x, m.emitido, 'pista')}${barra(x, m.cobrado, 'barra-dato')}
        <text class="valor" x="${x + anchoBarra / 2}" y="${y(m.cobrado) - 5}" text-anchor="middle">${pct(tasa)}</text>
        <text class="eje" x="${x + anchoBarra / 2}" y="${alto - 8}" text-anchor="middle">${mesNombre(m.periodo)}</text></g>`;
    }).join('')}
  </svg>`;
}

function activarTips(raiz) {
  let tip = null;
  raiz.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-tip]');
    if (!g) { tip?.remove(); tip = null; return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.append(tip); }
    tip.textContent = g.dataset.tip;
    tip.style.left = `${Math.min(e.clientX + 12, innerWidth - 250)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  raiz.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });
}

export async function mostrar(vista) {
  vista.innerHTML = cargando('Calculando indicadores…');
  const d = await api.get('/api/panel');
  const f = d.finanzas;
  const c = d.cumplimiento;
  const cons = Object.fromEntries(c.consentimientos.map((x) => [x.finalidad, x]));
  const maxGrado = Math.max(...f.deuda_por_grado.map((g) => g.deuda), 1);
  const diasArco = c.arco_mas_antigua ? Math.floor((Date.now() - new Date(c.arco_mas_antigua.replace(' ', 'T') + 'Z')) / 86400000) : 0;

  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Panel de dirección</h1><p>Datos al ${fecha(d.hoy)}.</p></div>
      <div class="acciones"><a class="btn" href="#/pagos">Ver morosos</a><a class="btn btn-primario" href="#/pagos/recordatorios">Enviar recordatorios</a></div></div>

    <div class="kpis">
      <div class="kpi"><span>Alumnos matriculados</span><strong>${d.alumnos.total}</strong>
        <small>${d.alumnos.por_nivel.map((n) => `${n.nivel} ${n.n}`).join(' · ')}</small></div>
      <div class="kpi"><span>Cobranza del año</span><strong>${pct(f.cobranza)}</strong>
        <small>${solesCorto(f.emitido - f.vencido)} de ${solesCorto(f.emitido)} vencido a la fecha</small>
        <div class="medidor"><div style="width:${pct(f.cobranza)}"></div></div></div>
      <div class="kpi"><span>Deuda vencida</span><strong style="color:var(--peligro)">${solesCorto(f.vencido)}</strong>
        <small>${f.alumnos_morosos} alumnos con deuda (${pct(f.morosidad)} de morosidad)</small></div>
      <div class="kpi"><span>Recaudado este mes</span><strong>${solesCorto(f.cobrado_mes)}</strong>
        <small>${d.whatsapp.recordatorios_30d} recordatorios en 30 días</small></div>
    </div>

    <div class="rejilla-2">
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Cobrado por mes de pensión</h2>
          <button class="btn btn-chico" id="ver-tabla">Ver tabla</button></div>
        <p class="pequeno" style="margin-top:-6px">Barra: cobrado · fondo claro: emitido · % = cobranza del mes</p>
        <div class="grafico" id="g-meses">${crudo(graficoMeses(f.por_mes))}</div>
        <div class="tabla-caja oculto" id="t-meses"><table><thead><tr><th>Mes</th><th class="num">Emitido</th><th class="num">Cobrado</th><th class="num">%</th></tr></thead>
          <tbody>${f.por_mes.map((m) => html`<tr><td>${mesNombre(m.periodo)}</td><td class="num">${soles(m.emitido)}</td><td class="num">${soles(m.cobrado)}</td><td class="num">${pct(m.emitido ? m.cobrado / m.emitido : 0)}</td></tr>`)}</tbody></table></div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Deuda vencida por grado</h2></div>
        <div class="barras-h">${f.deuda_por_grado.length ? f.deuda_por_grado.map((g) => html`
          <div class="barra-h" title="${g.alumnos} alumnos con deuda">
            <span>${g.grado}</span><div class="riel"><div class="relleno" style="width:${Math.max(2, (g.deuda / maxGrado) * 100)}%"></div></div>
            <span class="num">${solesCorto(g.deuda)}</span></div>`) : crudo('<p class="pequeno">Sin deuda vencida. 🎉</p>')}</div>
      </section>
    </div>

    <div class="rejilla" style="margin-top:16px">
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Ley 29733</h2><a class="btn btn-chico" href="#/datos">Gestionar</a></div>
        ${['whatsapp', 'salud', 'imagen'].map((k) => {
          const x = cons[k] || { si: 0, total: 0 };
          return html`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span>Autorizan ${k === 'whatsapp' ? 'WhatsApp' : k === 'salud' ? 'datos de salud' : 'uso de imagen'}</span><strong>${x.si || 0}</strong></div>
            <div class="medidor"><div style="width:${x.total ? Math.round((x.si / x.total) * 100) : 0}%"></div></div>
            <span class="pequeno">${x.total ? `${Math.round((x.si / x.total) * 100)}% de las respuestas registradas` : 'Sin respuestas'}</span></div>`;
        })}
        <p style="margin:8px 0 0">${c.arco_pendientes ? crudo(html`<span class="etiqueta etiqueta-larga ${diasArco > 7 ? 'etiqueta-peligro' : 'etiqueta-alerta'}">${c.arco_pendientes} solicitud(es) ARCO pendientes · la más antigua hace ${diasArco} días</span>`) : crudo('<span class="etiqueta etiqueta-ok">Sin solicitudes ARCO pendientes</span>')}</p>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Accesos a fichas (7 días)</h2><a class="btn btn-chico" href="#/auditoria">Registro</a></div>
        ${c.lecturas_fichas_7d.length ? crudo(html`<div class="barras-h">${c.lecturas_fichas_7d.map((l) => html`<div class="barra-h"><span>${ROL_NOMBRE[l.rol] || l.rol}</span><div class="riel"><div class="relleno" style="width:${Math.max(4, (l.n / Math.max(...c.lecturas_fichas_7d.map((x) => x.n))) * 100)}%"></div></div><span class="num">${l.n}</span></div>`)}</div>`) : crudo('<p class="pequeno">Nadie abrió fichas esta semana.</p>')}
        <p class="pequeno" style="margin-top:10px">${d.alumnos.con_alergias} alumnos con alergias registradas · ${d.whatsapp.por_atender} chats de WhatsApp por atender</p>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Actividad reciente</h2></div>
        <ul class="lista-actividad">${d.actividad.map((a) => html`<li><span>${a.usuario_nombre || 'Sistema'} · ${ACCIONES[a.accion] || a.accion}</span><span class="pequeno">${fecha(a.creado_en, true)}</span></li>`)}</ul>
      </section>
    </div>`;

  activarTips($('#g-meses', vista));
  $('#ver-tabla', vista).addEventListener('click', (e) => {
    const tabla = $('#t-meses', vista).classList.toggle('oculto');
    $('#g-meses', vista).classList.toggle('oculto', !tabla);
    e.target.textContent = tabla ? 'Ver tabla' : 'Ver gráfico';
  });
}
