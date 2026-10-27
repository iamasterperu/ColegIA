// Listas de útiles: carga desde Excel/CSV, foto (lectura en el navegador) o a mano.
import { api } from '../api.js';
import { html, crudo, $, $$, fecha, cargando, vacio, aviso, conBoton } from '../ui.js';
import { puede, sesion } from '../app.js';
import { leerHoja, mapearColumnas } from '../lib/xlsx.js';
import { leerFoto, parsearListaUtiles } from '../lib/ocr.js';

const SINONIMOS = {
  cantidad: ['cantidad', 'cant', 'qty', 'unidades', 'n', 'nro'],
  descripcion: ['descripcion', 'material', 'materiales', 'util', 'utiles', 'articulo', 'item', 'producto', 'nombre'],
  detalle: ['detalle', 'observacion', 'observaciones', 'marca', 'especificacion', 'nota'],
};

export async function mostrar(vista, [id]) {
  if (id === 'nueva') return editor(vista, null);
  if (id) return detalle(vista, id);
  vista.innerHTML = cargando();
  const listas = await api.get('/api/utiles');
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Listas de útiles</h1><p>${puede('utiles.editar') ? 'Sube un Excel o una foto de la lista y revísala antes de publicarla.' : 'Listas publicadas para el grado de tus hijos.'}</p></div>
      ${puede('utiles.editar') ? crudo('<a class="btn btn-primario" href="#/utiles/nueva">+ Nueva lista</a>') : ''}</div>
    ${listas.length ? crudo(html`<div class="tabla-caja"><table>
      <thead><tr><th>Grado</th><th>Título</th><th class="num">Ítems</th><th>Origen</th><th>Estado</th><th>Actualizada</th></tr></thead>
      <tbody>${listas.map((l) => html`<tr>
        <td>${l.grado}</td><td><a href="#/utiles/${l.id}">${l.titulo}</a></td><td class="num">${l.items}</td>
        <td>${{ foto: '📷 Foto', excel: '📊 Excel', manual: '✍️ Manual' }[l.fuente]}</td>
        <td>${l.publicada ? crudo('<span class="etiqueta etiqueta-ok">Publicada</span>') : crudo('<span class="etiqueta etiqueta-alerta">Borrador</span>')}</td>
        <td>${fecha(l.creado_en)}</td></tr>`)}</tbody></table></div>`) : vacio('Todavía no hay listas.')}`;
}

async function detalle(vista, id) {
  vista.innerHTML = cargando();
  const l = await api.get(`/api/utiles/${encodeURIComponent(id)}`);
  vista.innerHTML = html`
    <p class="pequeno"><a href="#/utiles">← Listas de útiles</a></p>
    <div class="encabezado"><div><h1>${l.titulo}</h1><p>${l.grado} · ${l.items.length} ítems · ${l.publicada ? 'publicada' : 'borrador (los padres aún no la ven)'}</p></div>
      <div class="acciones">
        <button class="btn" data-imprimir>Imprimir</button>
        ${puede('utiles.editar') ? crudo(html`
          <button class="btn" id="editar">Editar</button>
          <button class="btn" id="publicar">${l.publicada ? 'Despublicar' : 'Publicar'}</button>
          ${l.publicada ? crudo('<button class="btn btn-primario" id="avisar">Avisar por WhatsApp</button>') : ''}
          <button class="btn btn-peligro" id="borrar">Borrar</button>`) : ''}
      </div></div>
    <div class="tabla-caja"><table>
      <thead><tr><th class="num">Cant.</th><th>Material</th><th>Detalle</th></tr></thead>
      <tbody>${l.items.map((i) => html`<tr><td class="num">${i.cantidad || ''}</td><td>${i.descripcion}</td><td>${i.detalle || ''}</td></tr>`)}</tbody>
    </table></div>`;
  $('#editar', vista)?.addEventListener('click', () => editor(vista, l));
  $('#publicar', vista)?.addEventListener('click', (e) => conBoton(e.target, async () => {
    await api.post(`/api/utiles/${l.id}/publicar`, { publicada: !l.publicada });
    aviso(l.publicada ? 'Lista despublicada' : 'Lista publicada: los padres ya pueden verla y pedirla por WhatsApp');
    detalle(vista, id);
  }));
  $('#borrar', vista)?.addEventListener('click', (e) => confirm('¿Borrar esta lista?') && conBoton(e.target, async () => {
    await api.del(`/api/utiles/${l.id}`);
    location.hash = '#/utiles';
  }));
  $('#avisar', vista)?.addEventListener('click', (e) => conBoton(e.target, async () => {
    let total = 0;
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const r = await api.post(`/api/utiles/${l.id}/notificar`);
      total += r.enviados;
      if (!r.quedan) break;
    }
    aviso(total ? `Se avisó a ${total} apoderados que autorizaron WhatsApp` : 'Todos los apoderados con autorización ya fueron avisados');
  }));
}

function filaEditable(i = {}) {
  return html`<tr class="${i.dudoso ? 'duda' : ''}">
    <td style="width:90px"><input name="cantidad" value="${i.cantidad || ''}" aria-label="Cantidad"></td>
    <td><input name="descripcion" value="${i.descripcion || ''}" aria-label="Material"></td>
    <td><input name="detalle" value="${i.detalle || ''}" aria-label="Detalle"></td>
    <td style="width:44px"><button type="button" class="btn btn-chico btn-fantasma" data-quitar aria-label="Quitar">✕</button></td></tr>`;
}

async function editor(vista, lista) {
  const grados = await api.get('/api/grados');
  let fuente = lista?.fuente || 'manual';
  vista.innerHTML = html`
    <p class="pequeno"><a href="#/utiles">← Listas de útiles</a></p>
    <div class="encabezado"><div><h1>${lista ? 'Editar lista' : 'Nueva lista de útiles'}</h1>
      <p>Carga desde un Excel o una foto. La lectura se hace en tu equipo y luego revisas cada fila.</p></div></div>
    <div class="rejilla">
      <label class="zona-archivo" id="zona-excel">📊 <strong>Subir Excel o CSV</strong><span class="pequeno">Columnas: cantidad, descripción, detalle</span>
        <input type="file" accept=".xlsx,.csv,.txt" id="archivo-excel"></label>
      <label class="zona-archivo" id="zona-foto">📷 <strong>Subir foto de la lista</strong><span class="pequeno">Toma la foto de frente y con buena luz</span>
        <input type="file" accept="image/*" capture="environment" id="archivo-foto"></label>
    </div>
    <div id="estado-lectura" style="margin:12px 0"></div>
    <form id="f-lista" class="tarjeta form">
      <div class="form-fila">
        <label>Grado<select name="grado" required>${[...new Set(grados.map((g) => g.grado))].map((g) => html`<option ${g === lista?.grado ? 'selected' : ''}>${g}</option>`)}</select></label>
        <label>Año<input name="anio" type="number" value="${lista?.anio || sesion.colegio.anio_escolar}"></label>
        <label style="grid-column: span 2">Título<input name="titulo" value="${lista?.titulo || ''}" placeholder="Se completa solo si lo dejas vacío"></label>
      </div>
      <div class="tabla-caja"><table><thead><tr><th>Cant.</th><th>Material</th><th>Detalle</th><th></th></tr></thead>
        <tbody id="filas">${(lista?.items?.length ? lista.items : [{}, {}, {}]).map(filaEditable)}</tbody></table></div>
      <p class="pequeno oculto" id="nota-dudas">Las filas resaltadas se leyeron con poca seguridad: revísalas.</p>
      <div class="acciones">
        <button type="button" class="btn" id="agregar">+ Agregar fila</button>
        <button class="btn btn-primario">Guardar lista</button>
      </div>
    </form>`;

  const filas = $('#filas', vista);
  const estado = $('#estado-lectura', vista);
  const cargarItems = (items, origen) => {
    fuente = origen;
    filas.innerHTML = items.map(filaEditable).join('');
    $('#nota-dudas', vista).classList.toggle('oculto', !items.some((i) => i.dudoso));
  };
  $('#agregar', vista).addEventListener('click', () => filas.insertAdjacentHTML('beforeend', String(filaEditable())));
  filas.addEventListener('click', (e) => e.target.closest('[data-quitar]')?.closest('tr').remove());

  $('#archivo-excel', vista).addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      const tabla = await leerHoja(archivo);
      let mapa = mapearColumnas(tabla[0] || [], SINONIMOS);
      let datos = tabla.slice(1);
      if (!Object.values(mapa).includes('descripcion')) {
        // Sin encabezados: si la 1.ª columna es número, es la cantidad
        datos = tabla;
        mapa = /^\d+$/.test(tabla[0]?.[0] || '') ? { 0: 'cantidad', 1: 'descripcion', 2: 'detalle' } : { 0: 'descripcion', 1: 'detalle' };
      }
      const items = datos.map((f) => Object.fromEntries(Object.entries(mapa).map(([i, campo]) => [campo, f[i] || '']))).filter((i) => i.descripcion);
      cargarItems(items, 'excel');
      estado.innerHTML = html`<p class="nota-legal">✅ Leímos ${items.length} ítems de <strong>${archivo.name}</strong>. Revisa y guarda.</p>`;
    } catch (err) {
      estado.innerHTML = html`<p class="alerta">${err.message}</p>`;
    }
  });

  $('#archivo-foto', vista).addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    estado.innerHTML = html`<div class="rejilla"><img class="vista-foto" src="${url}" alt="Foto de la lista">
      <div><p><strong>Leyendo la foto…</strong> la primera vez descarga el lector de español (unos 10 MB).</p>
      <div class="progreso"><div id="avance"></div></div></div></div>`;
    try {
      const texto = await leerFoto(archivo, (p) => { const a = $('#avance', vista); if (a) a.style.width = `${Math.round(p * 100)}%`; });
      const items = parsearListaUtiles(texto);
      cargarItems(items.length ? items : [{}], 'foto');
      estado.innerHTML = html`<div class="rejilla"><img class="vista-foto" src="${url}" alt="Foto de la lista">
        <p class="nota-legal">✅ Encontramos ${items.length} ítems. Compara con la foto y corrige lo necesario. La foto no se guarda ni se envía al servidor.</p></div>`;
    } catch (err) {
      estado.innerHTML = html`<p class="alerta">${err.message}</p>`;
    }
  });

  $('#f-lista', vista).addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    const items = $$('tr', filas).map((tr) => ({
      cantidad: $('[name=cantidad]', tr).value, descripcion: $('[name=descripcion]', tr).value, detalle: $('[name=detalle]', tr).value,
    })).filter((i) => i.descripcion.trim());
    await conBoton($('.btn-primario', e.target), async () => {
      const r = await api.post('/api/utiles', { ...datos, items, fuente });
      aviso(`Lista guardada con ${r.items} ítems`);
      location.hash = `#/utiles/${r.id}`;
    });
  });
}

