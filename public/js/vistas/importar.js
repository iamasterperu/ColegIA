// Importar alumnos/apoderados y pagos desde Excel. El archivo se lee aquí, en el
// navegador; al servidor solo llegan bloques de 90 filas ya convertidas.
import { api } from '../api.js';
import { html, crudo, $, $$, aviso } from '../ui.js';
import { puede } from '../app.js';
import { leerHoja, mapearColumnas, fechaIso } from '../lib/xlsx.js';

const TIPOS = {
  alumnos: {
    titulo: 'Alumnos y apoderados', permiso: 'importar.alumnos',
    campos: {
      codigo: ['codigo', 'cod', 'codigo alumno', 'codigo del alumno', 'id alumno'],
      apellidos: ['apellidos', 'apellido', 'apellidos alumno', 'apellidos del alumno'],
      nombres: ['nombres', 'nombre', 'nombres alumno', 'nombres del alumno'],
      apellidos_nombres: ['apellidos y nombres', 'alumno', 'nombre completo', 'estudiante'],
      dni: ['dni', 'dni alumno', 'documento', 'dni del alumno'],
      fecha_nacimiento: ['fecha de nacimiento', 'nacimiento', 'f nacimiento', 'fecha nac'],
      nivel: ['nivel'],
      grado: ['grado', 'ano', 'grado y nivel'],
      seccion: ['seccion', 'aula'],
      apoderado_nombres: ['nombres apoderado', 'apoderado nombres', 'nombre del apoderado', 'apoderado'],
      apoderado_apellidos: ['apellidos apoderado', 'apoderado apellidos', 'apellidos del apoderado'],
      apoderado_dni: ['dni apoderado', 'dni del apoderado', 'apoderado dni'],
      telefono: ['celular', 'telefono', 'whatsapp', 'movil', 'cel'],
      email: ['correo', 'email', 'e mail'],
      parentesco: ['parentesco', 'relacion'],
      autoriza_whatsapp: ['autoriza whatsapp', 'consentimiento whatsapp', 'acepta whatsapp'],
    },
    ejemplo: [
      ['codigo', 'apellidos', 'nombres', 'dni', 'fecha_nacimiento', 'grado', 'seccion', 'apoderado_nombres', 'apoderado_apellidos', 'apoderado_dni', 'celular', 'correo', 'parentesco', 'autoriza_whatsapp'],
      ['A0001', 'Pérez Rojas', 'Lucía', '71234567', '2016-05-14', '4° Primaria', 'A', 'Carmen', 'Rojas Díaz', '41234567', '987654321', 'carmen@correo.com', 'Madre', 'SI'],
    ],
  },
  personal: {
    titulo: 'Personal del colegio', permiso: 'usuarios.gestionar',
    campos: {
      nombre: ['nombre', 'nombres', 'apellidos y nombres', 'nombre completo', 'docente', 'trabajador', 'personal'],
      rol: ['cargo', 'rol', 'puesto', 'funcion', 'area'],
      telefono: ['celular', 'telefono', 'whatsapp', 'movil', 'cel'],
      email: ['correo', 'email', 'e mail'],
      secciones: ['secciones', 'aulas', 'grados', 'seccion', 'aula a cargo', 'tutoria'],
    },
    ejemplo: [
      ['nombre', 'cargo', 'celular', 'correo', 'secciones'],
      ['María Elena Quispe', 'Directora', '987654321', 'direccion@micolegio.pe', ''],
      ['Raúl Paredes', 'Contador', '987654322', '', ''],
      ['Karina Salazar', 'Secretaria', '987654323', '', ''],
      ['Jorge Huamán', 'Profesor', '987654324', '', '3° Primaria A, 3° Primaria B'],
    ],
  },
  pagos: {
    titulo: 'Pagos y pensiones', permiso: 'importar.pagos',
    campos: {
      codigo: ['codigo', 'cod', 'codigo alumno', 'codigo del alumno'],
      concepto: ['concepto', 'descripcion', 'detalle'],
      periodo: ['periodo', 'mes'],
      monto: ['monto', 'importe', 'total', 'monto s'],
      vencimiento: ['vencimiento', 'fecha de vencimiento', 'vence', 'f vencimiento'],
      estado: ['estado', 'situacion'],
      fecha_pago: ['fecha de pago', 'fecha pago', 'pagado el', 'f pago'],
    },
    ejemplo: [
      ['codigo', 'concepto', 'periodo', 'monto', 'vencimiento', 'estado', 'fecha_pago'],
      ['A0001', 'Pensión marzo', '2026-03', '520.00', '31/03/2026', 'pagado', '28/03/2026'],
      ['A0001', 'Pensión abril', '2026-04', '520.00', '30/04/2026', 'pendiente', ''],
    ],
  },
};

const LOTE = 90;

export async function mostrar(vista, [tipo]) {
  const disponibles = Object.entries(TIPOS).filter(([, t]) => puede(t.permiso));
  const actual = TIPOS[tipo] && puede(TIPOS[tipo].permiso) ? tipo : disponibles[0][0];
  const t = TIPOS[actual];
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Importar desde Excel</h1><p>Sube tu archivo .xlsx o .csv. Se lee en tu computadora y verás una vista previa antes de guardar.</p></div></div>
    <div class="pestanas">${disponibles.map(([k, x]) => html`<button data-t="${k}" class="${k === actual ? 'activo' : ''}">${x.titulo}</button>`)}</div>
    <div class="rejilla-2">
      <label class="zona-archivo" id="zona">📊 <strong>Arrastra o elige tu Excel</strong><span class="pequeno">.xlsx o .csv · la primera fila debe tener los títulos de columna</span>
        <input type="file" accept=".xlsx,.csv,.txt" id="archivo"></label>
      <div class="tarjeta"><h2>Plantilla</h2><p class="pequeno">Columnas que reconocemos automáticamente (no importa el orden ni las tildes).</p>
        <button class="btn" id="plantilla">Descargar plantilla CSV</button>
        ${actual === 'personal' ? crudo('<p class="nota-legal" style="margin-top:10px"><span>El <strong>celular</strong> es lo que importa: con él el asistente de WhatsApp reconoce a cada persona y le da el menú de su cargo. A los profesores, indica sus secciones (solo verán esos alumnos). Se crean sin contraseña web: si alguien necesita entrar a la web, asígnasela en <strong>Usuarios → Editar</strong>.</span></p>') : ''}
        ${actual === 'alumnos' ? crudo('<p class="nota-legal" style="margin-top:10px">“autoriza_whatsapp = SI” solo si el apoderado firmó la autorización en la ficha de matrícula. Queda registrado como consentimiento por importación.</p>') : ''}
      </div>
    </div>
    <div id="previa" style="margin-top:16px"></div>`;

  $('.pestanas', vista).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) location.hash = `#/importar/${b.dataset.t}`; });
  $('#plantilla', vista).addEventListener('click', () => {
    const csv = '﻿' + t.ejemplo.map((f) => f.map((c) => `"${c}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `plantilla-${actual}.csv`;
    a.click();
  });
  const zona = $('#zona', vista);
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); procesar(e.dataTransfer.files[0]); });
  $('#archivo', vista).addEventListener('change', (e) => procesar(e.target.files[0]));

  async function procesar(archivo) {
    if (!archivo) return;
    const previa = $('#previa', vista);
    let tabla;
    try {
      tabla = await leerHoja(archivo);
    } catch (e) {
      previa.innerHTML = html`<p class="alerta">${e.message}</p>`;
      return;
    }
    if (tabla.length < 2) { previa.innerHTML = html`<p class="alerta">El archivo no tiene filas de datos.</p>`; return; }
    // Busca la fila de encabezados dentro de las primeras 5 (a veces hay un título arriba)
    let filaEnc = 0;
    let mapa = {};
    for (let i = 0; i < Math.min(5, tabla.length); i++) {
      const m = mapearColumnas(tabla[i], t.campos);
      if (Object.keys(m).length > Object.keys(mapa).length) { mapa = m; filaEnc = i; }
    }
    const encabezados = tabla[filaEnc];
    const datos = tabla.slice(filaEnc + 1);
    previa.innerHTML = html`
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>${archivo.name}: ${datos.length} filas</h2><button class="btn btn-primario" id="importar">Importar ${datos.length} filas</button></div>
        <p class="pequeno">Revisa a qué campo corresponde cada columna:</p>
        <div class="tabla-caja"><table>
          <thead><tr>${encabezados.map((h, i) => html`<th>${h || `Columna ${i + 1}`}<br>
            <select data-col="${i}"><option value="">(ignorar)</option>${Object.keys(t.campos).map((c) => html`<option value="${c}" ${mapa[i] === c ? 'selected' : ''}>${c}</option>`)}</select></th>`)}</tr></thead>
          <tbody>${datos.slice(0, 8).map((f) => html`<tr>${encabezados.map((_, i) => html`<td>${f[i] || ''}</td>`)}</tr>`)}</tbody>
        </table></div>
        <div class="progreso oculto" id="barra" style="margin-top:12px"><div></div></div>
        <div id="resultado"></div>
      </section>`;

    $('#importar', previa).addEventListener('click', async (e) => {
      const boton = e.target;
      const mapaFinal = Object.fromEntries($$('[data-col]', previa).filter((s) => s.value).map((s) => [s.dataset.col, s.value]));
      const filas = datos.map((f, n) => {
        const o = { _fila: filaEnc + n + 2 };
        for (const [i, campo] of Object.entries(mapaFinal)) o[campo] = f[i] ?? '';
        return normalizarFila(actual, o);
      });
      boton.disabled = true;
      const barra = $('#barra', previa);
      barra.classList.remove('oculto');
      let creados = 0;
      const errores = [];
      try {
        for (let i = 0; i < filas.length; i += LOTE) {
          const r = await api.post(`/api/importar/${actual}`, { filas: filas.slice(i, i + LOTE) });
          creados += r.creados;
          errores.push(...r.errores);
          barra.firstElementChild.style.width = `${Math.min(100, ((i + LOTE) / filas.length) * 100)}%`;
        }
        aviso(`Importación terminada: ${creados} filas guardadas`);
      } catch (err) {
        aviso(err.message, 'error');
      } finally {
        boton.disabled = false;
      }
      $('#resultado', previa).innerHTML = html`<p><strong>${creados}</strong> filas guardadas · <strong>${errores.length}</strong> con errores</p>
        ${errores.length ? crudo(html`<div class="tabla-caja"><table><thead><tr><th>Fila</th><th>Problema</th></tr></thead>
          <tbody>${errores.slice(0, 200).map((x) => html`<tr><td>${x.fila}</td><td>${x.error}</td></tr>`)}</tbody></table></div>`) : ''}`;
    });
  }
}

function normalizarFila(tipo, o) {
  if (tipo === 'alumnos') {
    if (o.apellidos_nombres && !(o.nombres && o.apellidos)) {
      // "PÉREZ ROJAS, Lucía" o "Pérez Rojas Lucía"
      const [ap, no] = o.apellidos_nombres.includes(',') ? o.apellidos_nombres.split(',') : [o.apellidos_nombres.split(' ').slice(0, 2).join(' '), o.apellidos_nombres.split(' ').slice(2).join(' ')];
      o.apellidos = ap?.trim(); o.nombres = no?.trim();
    }
    delete o.apellidos_nombres;
    if (o.apoderado_nombres && !o.apoderado_apellidos && o.apoderado_nombres.includes(' ')) {
      const partes = o.apoderado_nombres.trim().split(/\s+/);
      o.apoderado_nombres = partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
      o.apoderado_apellidos = partes.slice(Math.ceil(partes.length / 2)).join(' ');
    }
    if (o.fecha_nacimiento) o.fecha_nacimiento = fechaIso(o.fecha_nacimiento);
    if (o.grado && /^\d$/.test(o.grado.trim()) && o.nivel) o.grado = `${o.grado.trim()}° ${o.nivel.trim()}`;
  } else if (tipo === 'personal') {
    o.telefono = String(o.telefono || '').replace(/\.0$/, '');
  } else {
    o.vencimiento = fechaIso(o.vencimiento);
    if (o.fecha_pago) o.fecha_pago = fechaIso(o.fecha_pago);
  }
  return o;
}

