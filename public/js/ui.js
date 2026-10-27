// Utilidades de interfaz compartidas por las vistas.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Plantilla segura: todo valor interpolado se escapa, salvo el resultado de otra
// plantilla html`` o lo envuelto en crudo(). Los arreglos se unen sin separador.
class Seguro {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const crudo = (s) => new Seguro(String(s));
const pieza = (v) => (v instanceof Seguro ? v.s : Array.isArray(v) ? v.map(pieza).join('') : v === false || v == null ? '' : esc(v));
export function html(partes, ...valores) {
  return new Seguro(partes.reduce((acc, p, i) => acc + pieza(valores[i - 1]) + p));
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export const soles = (centimos) =>
  'S/ ' + (Number(centimos || 0) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const solesCorto = (centimos) => {
  const s = Number(centimos || 0) / 100;
  return s >= 1000 ? `S/ ${(s / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} mil` : soles(centimos);
};
export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(iso, conHora = false) {
  if (!iso) return '—';
  // Las fechas con hora vienen en UTC desde D1; se muestran en hora de Lima
  if (iso.length > 10) {
    const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
    const txt = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
    return conHora ? `${txt} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}` : txt;
  }
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}
export const mesNombre = (periodo) => MESES[Number(periodo.slice(5, 7)) - 1];
export const telefonoBonito = (t) => (t ? `+${t.slice(0, 2)} ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}` : '—');

export function aviso(mensaje, tipo = 'ok') {
  const caja = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = mensaje;
  caja.append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}

export function modal(contenidoHtml, { ancho = 560 } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:${ancho}px">
    <button class="modal-cerrar" aria-label="Cerrar">×</button>${contenidoHtml}</div>`;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => e.key === 'Escape' && cerrar();
  fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('.modal-cerrar')) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);
  fondo.querySelector('input, select, textarea, button:not(.modal-cerrar)')?.focus();
  return { raiz: fondo.querySelector('.modal'), cerrar };
}

export const cargando = (texto = 'Cargando…') => crudo(`<div class="cargando" role="status"><span class="spinner"></span>${esc(texto)}</div>`);
export const vacio = (texto) => crudo(`<div class="vacio">${esc(texto)}</div>`);

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Ejecuta una acción con el botón deshabilitado y muestra el error si falla
export async function conBoton(boton, fn) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.classList.add('ocupado');
  try {
    return await fn();
  } catch (e) {
    aviso(e.message, 'error');
  } finally {
    boton.disabled = false;
    boton.classList.remove('ocupado');
    boton.textContent = texto;
  }
}

export const ROL_NOMBRE = { direccion: 'Dirección', contabilidad: 'Contabilidad', secretaria: 'Secretaría', profesor: 'Profesor', padre: 'Padre/apoderado', sistema: 'Sistema' };
export const ACCIONES = {
  login: 'Inició sesión', login_fallido: 'Intento de ingreso fallido', ver_ficha: 'Vio la ficha', buscar_alumnos: 'Buscó alumnos',
  editar_alumno: 'Editó alumno', crear_alumno: 'Creó alumno', anonimizar_alumno: 'Anonimizó alumno', editar_apoderado: 'Editó apoderado',
  ver_pagos: 'Vio pagos', registrar_pago: 'Registró un pago', revertir_pago: 'Revirtió un pago', ver_recordatorios: 'Vio recordatorios',
  enviar_recordatorios: 'Envió recordatorios', recordatorios_automaticos: 'Recordatorios automáticos', ver_panel: 'Vio el panel',
  ver_contactos_whatsapp: 'Vio contactos de WhatsApp', ver_conversacion: 'Abrió una conversación', escuchar_audio: 'Escuchó un audio',
  responder_whatsapp: 'Respondió por WhatsApp', ver_consentimientos: 'Vio consentimientos', otorgar_consentimiento: 'Otorgó consentimiento',
  revocar_consentimiento: 'Revocó consentimiento', solicitud_arco: 'Envió solicitud ARCO', atender_arco: 'Atendió solicitud ARCO',
  descargar_mis_datos: 'Descargó sus datos', crear_usuario: 'Creó usuario', editar_usuario: 'Editó usuario', editar_ajustes: 'Editó ajustes',
  cambiar_clave: 'Cambió su contraseña', guardar_lista_utiles: 'Guardó lista de útiles', borrar_lista_utiles: 'Borró lista de útiles',
  avisar_lista_utiles: 'Avisó lista de útiles', importar_alumnos: 'Importó alumnos', importar_pagos: 'Importó pagos',
};
