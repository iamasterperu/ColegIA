// WhatsApp: bandeja de conversaciones + chat de prueba (texto y audio) que habla con el bot.
import { api } from '../api.js';
import { html, crudo, $, fecha, telefonoBonito, aviso, cargando, vacio } from '../ui.js';
import { puede, sesion } from '../app.js';

const MAX_SEGUNDOS = 60;
let sondeo = null;

// Los PDF que manda el asistente (exámenes, sesiones) se pueden abrir desde el chat
const enlazar = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const negritas = (t) => html`${t}`.toString().replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

function burbuja(m) {
  const propia = m.sentido === 'saliente';
  const motivo = { recordatorio: 'Recordatorio', manual: 'Respuesta del colegio', bot: '', aviso: 'Aviso' }[m.motivo] ?? (m.motivo?.startsWith('utiles') ? 'Aviso de útiles' : '');
  return html`<div class="burbuja ${propia ? 'propia' : ''} ${m.estado === 'error' ? 'error' : ''}" data-id="${m.id}">
    ${motivo ? crudo(html`<span class="motivo">${motivo}${m.canal === 'cloud' ? ' · WhatsApp real' : ''}</span>`) : ''}
    ${m.tipo === 'audio'
      ? crudo(html`🎤 Nota de voz ${m.tiene_audio ? crudo(html`<button class="btn btn-chico" data-audio="${m.id}">▶ Escuchar</button>`) : ''}
          ${m.transcripcion ? crudo(html`<div class="transcripcion">“${m.transcripcion}”</div>`) : ''}`)
      : crudo(`<div class="cuerpo">${enlazar(negritas(m.texto || ''))}</div>`)}
    ${propia && m.motivo === 'bot' ? crudo(html`<button class="btn btn-chico btn-fantasma" data-leer="${m.texto || ''}" title="Escuchar respuesta" aria-label="Escuchar respuesta">🔊</button>`) : ''}
    ${m.estado === 'error' ? crudo(html`<div class="pequeno" style="color:var(--peligro)">No se entregó: ${m.error || ''}</div>`) : ''}
    ${m.estado === 'por_atender' ? crudo('<div class="pequeno" style="color:var(--alerta)">Por atender</div>') : ''}
    <time>${fecha(m.creado_en, true)}</time></div>`;
}

export async function mostrar(vista, [telInicial]) {
  clearInterval(sondeo);
  vista.innerHTML = cargando();
  const [conversaciones, { apoderados, personal }] = await Promise.all([api.get('/api/whatsapp/conversaciones'), api.get('/api/whatsapp/contactos')]);
  const ROL = { direccion: 'Dirección', contabilidad: 'Contabilidad', secretaria: 'Secretaría', profesor: 'Profesor' };
  const contactos = [
    ...personal.map((p) => ({ telefono: p.telefono, nombres: p.nombre, apellidos: '', hijos: ROL[p.rol], personal: true })),
    ...apoderados,
  ];
  const real = sesion.colegio.wa_modo === 'cloud';
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>WhatsApp</h1>
      <p>${real ? 'Conectado a WhatsApp Cloud API. El chat de prueba sigue siendo simulado.' : 'Modo simulado: nada sale a WhatsApp real. Prueba el agente escribiendo como un padre o como alguien del personal.'}</p></div>
      ${puede('ajustes.editar') ? crudo('<a class="btn" href="#/ajustes">Conectar WhatsApp real</a>') : ''}</div>
    <p class="nota-legal" style="margin-bottom:12px">Cada persona recibe su propio menú: dirección (resumen, deuda por aula, alertas, comunicados), profesores (exámenes A/B en PDF, sesiones, radar, faltas), contabilidad (cobranza, vouchers), secretaría (fotos de listas y fichas, Excel, avisos), padres (pagos, notas, útiles que faltan, justificar) y alumnos (tutor IA). Elige a alguien y escribe "hola"; con 📎 envías fotos o Excel.</p>
    <div class="wa">
      <aside class="wa-lista">
        <div class="wa-lista-cab">
          <label class="pequeno">Escribir al agente como…
            <select id="contacto"><option value="">Elige una persona…</option>
              <optgroup label="Personal del colegio">${personal.map((p) => html`<option value="${p.telefono}">${ROL[p.rol]}: ${p.nombre}</option>`)}</optgroup>
              <optgroup label="Padres y apoderados">${apoderados.map((c) => html`<option value="${c.telefono}">${c.apellidos}, ${c.nombres} — ${c.hijos}${c.consiente ? '' : ' (sin autorización)'}</option>`)}</optgroup>
              <optgroup label="Otros"><option value="51900000000">Número nuevo${sesion.colegio.es_demo ? ' (elige un rol de demo)' : ' no registrado'}</option></optgroup>
            </select></label>
        </div>
        <div class="wa-conversaciones" id="convs">
          ${conversaciones.length ? conversaciones.map((c) => html`<button class="wa-conv" data-tel="${c.telefono}">
            <strong><span>${c.nombres ? `${c.nombres} ${c.apellidos}` : telefonoBonito(c.telefono)}</span>${c.por_atender ? crudo(html`<span class="etiqueta etiqueta-alerta">${c.por_atender}</span>`) : ''}</strong>
            <span>${c.sentido === 'saliente' ? 'Tú: ' : ''}${c.tipo === 'audio' ? '🎤 Audio' : (c.texto || '').replace(/\*/g, '')}</span></button>`) : vacio('Sin conversaciones todavía')}
        </div>
      </aside>
      <section class="wa-chat" id="chat">${vacio('Elige una conversación o un apoderado para probar el bot.')}</section>
    </div>`;

  const abrir = (tel) => abrirChat($('#chat', vista), tel, contactos.find((c) => c.telefono === tel));
  $('#convs', vista).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tel]');
    if (!b) return;
    vista.querySelectorAll('.wa-conv').forEach((x) => x.classList.toggle('activo', x === b));
    abrir(b.dataset.tel);
  });
  $('#contacto', vista).addEventListener('change', (e) => e.target.value && abrir(e.target.value));
  if (telInicial) abrir(telInicial);
}

async function abrirChat(caja, telefono, contacto) {
  clearInterval(sondeo);
  let modo = 'apoderado';
  let ultimo = 0;
  caja.innerHTML = html`
    <div class="wa-chat-cab">
      <div style="flex:1;min-width:160px"><strong>${contacto ? `${contacto.nombres} ${contacto.apellidos}` : telefonoBonito(telefono)}</strong>
        <div class="pequeno">${telefonoBonito(telefono)} ${contacto ? `· ${contacto.hijos}` : ''}</div></div>
      ${contacto && !contacto.personal ? crudo(contacto.consiente ? '<span class="etiqueta etiqueta-ok">Autorizó WhatsApp</span>' : '<span class="etiqueta etiqueta-alerta">Sin autorización</span>') : ''}
      ${contacto?.personal ? crudo('<span class="etiqueta">Personal</span>') : ''}
      <div class="modo-chat" role="group" aria-label="Quién escribe">
        <button data-modo="apoderado" class="activo">Escribo como esta persona</button>
        ${puede('whatsapp.responder') ? crudo('<button data-modo="colegio">Respondo como colegio</button>') : ''}
      </div>
    </div>
    <div class="wa-mensajes" id="mensajes" aria-live="polite">${cargando()}</div>
    <form class="wa-entrada" id="f-msg">
      <button type="button" class="btn btn-redondo" id="adjuntar" title="Enviar foto o Excel" aria-label="Enviar foto o Excel">📎</button>
      <input type="file" id="archivo" accept="image/*,.xlsx,.csv" hidden>
      <button type="button" class="btn btn-redondo" id="microfono" title="Grabar nota de voz" aria-label="Grabar nota de voz">🎤</button>
      <input name="texto" placeholder="Escribe: hola, 1, cuánto debo, falta Mateo…" autocomplete="off" aria-label="Mensaje">
      <button class="btn btn-primario btn-redondo" aria-label="Enviar">➤</button>
    </form>
    <p class="pequeno" style="margin:0;padding:0 12px 8px" id="ayuda-audio"></p>`;

  const lista = $('#mensajes', caja);
  const agregar = (mensajes) => {
    if (!mensajes.length) return;
    if (!ultimo) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', mensajes.map(burbuja).join(''));
    ultimo = Math.max(ultimo, ...mensajes.map((m) => m.id));
    lista.scrollTop = lista.scrollHeight;
  };
  const traer = async () => agregar(await api.get(`/api/whatsapp/conversacion?telefono=${telefono}&despues=${ultimo}`));
  const inicial = await api.get(`/api/whatsapp/conversacion?telefono=${telefono}`);
  lista.innerHTML = inicial.length ? '' : String(vacio('Escribe "hola" para empezar.'));
  agregar(inicial);
  // En modo real llegan mensajes por el webhook: se consulta cada 8 s mientras la pestaña está visible
  sondeo = setInterval(() => { if (!document.hidden && document.body.contains(lista)) traer().catch(() => {}); else if (!document.body.contains(lista)) clearInterval(sondeo); }, 8000);

  caja.querySelector('.modo-chat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    modo = b.dataset.modo;
    caja.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('activo', x === b));
    $('[name=texto]', caja).placeholder = modo === 'colegio' ? 'Respuesta del colegio al apoderado…' : 'Escribe: hola, deuda, útiles, notas…';
    $('#microfono', caja).disabled = modo === 'colegio';
  });

  const enviarSimulado = async (datos) => {
    await api.post('/api/whatsapp/simulador', { telefono, ...datos });
    await traer();
  };

  $('#f-msg', caja).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.texto;
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    try {
      if (modo === 'colegio') {
        const r = await api.post('/api/whatsapp/responder', { telefono, texto });
        if (r.estado === 'error') aviso(`WhatsApp no lo entregó: ${r.error}`, 'error');
        await traer();
      } else {
        await enviarSimulado({ texto });
      }
    } catch (err) {
      aviso(err.message, 'error');
      input.value = texto;
    }
  });

  lista.addEventListener('click', async (e) => {
    const audio = e.target.closest('[data-audio]');
    if (audio) {
      const blob = await api.get(`/api/whatsapp/audio/${audio.dataset.audio}`);
      const el = document.createElement('audio');
      el.controls = true;
      el.src = URL.createObjectURL(blob);
      audio.replaceWith(el);
      el.play().catch(() => {});
    }
    const leer = e.target.closest('[data-leer]');
    if (leer && 'speechSynthesis' in window) {
      const voz = new SpeechSynthesisUtterance(leer.dataset.leer.replace(/[*•]/g, '').replace(/\p{Extended_Pictographic}/gu, ''));
      voz.lang = 'es-PE';
      speechSynthesis.cancel();
      speechSynthesis.speak(voz);
    }
  });

  // Foto (voucher, lista de útiles, ficha, página del libro) o Excel: lo que escribas en la caja va como pie
  const adjunto = $('#archivo', caja);
  $('#adjuntar', caja).addEventListener('click', () => adjunto.click());
  adjunto.addEventListener('change', async () => {
    const archivo = adjunto.files[0];
    adjunto.value = '';
    if (!archivo) return;
    if (archivo.size > 1_500_000) return aviso('El archivo pesa más de 1,5 MB', 'error');
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(archivo); });
    const pie = $('[name=texto]', caja);
    aviso(archivo.type.startsWith('image/') ? 'Enviando foto… la IA la está leyendo' : 'Enviando archivo…');
    try {
      await enviarSimulado({ archivo_b64: b64, mime: archivo.type || 'application/octet-stream', nombre: archivo.name, texto: pie.value.trim() });
      pie.value = '';
    } catch (err) { aviso(err.message, 'error'); }
  });

  configurarMicrofono(caja, enviarSimulado);
}

function configurarMicrofono(caja, enviarSimulado) {
  const boton = $('#microfono', caja);
  const ayuda = $('#ayuda-audio', caja);
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    boton.disabled = true;
    ayuda.textContent = 'Tu navegador no permite grabar audio.';
    return;
  }
  ayuda.textContent = Reconocimiento
    ? 'Toca 🎤 para grabar (máx. 1 min). El navegador transcribe tu voz para que el bot la entienda.'
    : 'Toca 🎤 para grabar. Este navegador no transcribe voz: el audio quedará "por atender" para secretaría.';
  let grabadora = null;
  let reconocimiento = null;
  let transcripcion = '';
  let corte = null;

  const detener = () => {
    clearTimeout(corte);
    reconocimiento?.stop();
    if (grabadora?.state === 'recording') grabadora.stop();
  };

  boton.addEventListener('click', async () => {
    if (grabadora?.state === 'recording') return detener();
    let flujo;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return aviso('No diste permiso para usar el micrófono', 'error');
    }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    const trozos = [];
    transcripcion = '';
    grabadora.ondataavailable = (e) => e.data.size && trozos.push(e.data);
    grabadora.onstop = async () => {
      flujo.getTracks().forEach((t) => t.stop());
      boton.classList.remove('grabando');
      boton.textContent = '🎤';
      const blob = new Blob(trozos, { type: grabadora.mimeType || 'audio/webm' });
      if (blob.size < 1500) return aviso('El audio salió muy corto', 'error');
      await new Promise((r) => setTimeout(r, 400)); // da tiempo al último resultado de la transcripción
      const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      try {
        await enviarSimulado({ audio_b64: b64, mime: blob.type.split(';')[0], transcripcion: transcripcion.trim() });
      } catch (err) { aviso(err.message, 'error'); }
    };
    if (Reconocimiento) {
      reconocimiento = new Reconocimiento();
      reconocimiento.lang = 'es-PE';
      reconocimiento.continuous = true;
      reconocimiento.interimResults = false;
      reconocimiento.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcripcion += ` ${e.results[i][0].transcript}`;
      };
      reconocimiento.onerror = () => {};
      try { reconocimiento.start(); } catch { /* ya iniciado */ }
    }
    grabadora.start();
    boton.classList.add('grabando');
    boton.textContent = '■';
    corte = setTimeout(detener, MAX_SEGUNDOS * 1000);
  });
}
