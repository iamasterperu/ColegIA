// Chat privado del colegio: pantalla completa, estilo ChatGPT, para cualquier rol.
import { api } from '../api.js';
import { html, crudo, $, aviso, fecha } from '../ui.js';
import { sesion } from '../app.js';

const MAX_SEGUNDOS = 60;
let sondeo = null;

const enlazar = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const negritas = (t) => html`${t}`.toString().replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

function burbuja(m) {
  const mio = m.sentido === 'entrante';
  const cuerpo = m.tipo === 'audio'
    ? html`🎤 Nota de voz${m.transcripcion ? crudo(html`<div class="transcripcion">“${m.transcripcion}”</div>`) : ''}`
    : m.tipo === 'imagen' ? html`📷 Foto${m.texto ? crudo(html`<div>${m.texto}</div>`) : ''}`
    : m.tipo === 'documento' ? html`📎 Archivo${m.texto ? crudo(html`<div>${m.texto}</div>`) : ''}`
    : crudo(`<div class="cuerpo">${enlazar(negritas(m.texto || ''))}</div>`);
  return html`<div class="cb ${mio ? 'cb-mio' : 'cb-bot'}" data-id="${m.id}">
    ${cuerpo}
    ${mio ? '' : crudo(html`<button class="cb-leer" data-leer="${m.texto || ''}" title="Escuchar" aria-label="Escuchar respuesta">🔊</button>`)}
    <time>${fecha(m.creado_en, true)}</time></div>`;
}

export async function mostrar(vista) {
  clearInterval(sondeo);
  const nombre = sesion.usuario.nombre.split(' ')[0];
  vista.classList.add('vista-chat');
  vista.innerHTML = html`
    <div class="chat-app">
      <div class="chat-msgs" id="chat-msgs" aria-live="polite"></div>
      <div class="chat-sug" id="chat-sug"></div>
      <form class="chat-entrada" id="chat-form">
        <button type="button" class="btn btn-redondo" id="chat-adj" aria-label="Enviar foto o Excel">📎</button>
        <input type="file" id="chat-archivo" accept="image/*,.xlsx,.csv" hidden>
        <textarea name="texto" rows="1" placeholder="Escribe aquí, ${nombre}…" aria-label="Mensaje" autocomplete="off"></textarea>
        <button type="button" class="btn btn-redondo" id="chat-mic" aria-label="Grabar nota de voz">🎤</button>
        <button class="btn btn-primario btn-redondo" aria-label="Enviar">➤</button>
      </form>
    </div>`;
  const lista = $('#chat-msgs', vista);
  const form = $('#chat-form', vista);
  const caja = form.texto;
  let ultimo = 0;

  const agregar = (ms) => {
    ms = ms.filter((m) => m.id > ultimo);
    if (!ms.length) return;
    lista.querySelector('.chat-vacio')?.remove();
    lista.insertAdjacentHTML('beforeend', ms.map(burbuja).join(''));
    ultimo = Math.max(ultimo, ...ms.map((m) => m.id));
    lista.scrollTop = lista.scrollHeight;
  };
  const pensando = (si) => {
    lista.querySelector('.cb-pensando')?.remove();
    if (si) { lista.insertAdjacentHTML('beforeend', '<div class="cb cb-bot cb-pensando"><span class="spinner"></span> Escribiendo…</div>'); lista.scrollTop = lista.scrollHeight; }
  };

  const enviar = async (datos) => {
    pensando(true);
    try {
      const r = await api.post('/api/chat', { ...datos, despues: ultimo });
      pensando(false);
      agregar(r.mensajes);
    } catch (e) { pensando(false); throw e; }
  };

  let inicial;
  try { inicial = await api.get('/api/chat/historial'); } catch (e) {
    lista.innerHTML = html`<div class="chat-vacio"><h2>Chat del colegio</h2><p>${e.message}</p></div>`;
    form.querySelectorAll('button,textarea').forEach((x) => { x.disabled = true; });
    return;
  }
  if (inicial.length) agregar(inicial);
  else {
    lista.innerHTML = html`<div class="chat-vacio"><div class="logo-chat">${sesion.colegio.nombre[0]}</div>
      <h2>Hola, ${nombre} 👋</h2><p>Este es el chat privado de ${sesion.colegio.nombre}. Escribe o habla; te respondo según tu rol.</p></div>`;
    enviar({ texto: 'hola' }).catch((e) => aviso(e.message, 'error'));
  }
  const SUG = {
    padre: ['Cuánto debo', 'Notas de mi hijo', 'Útiles que faltan', 'Avisar que mi hijo faltó'],
    profesor: ['Crear un examen', 'Preparar una sesión', 'Alumnos con faltas', 'Menú'],
    direccion: ['Resumen del día', 'Deuda por aula', 'Alertas', 'Menú'],
    secretaria: ['Menú', 'Avisos pendientes', 'Alumnos nuevos'],
    contabilidad: ['Cobranza de hoy', 'Vouchers por revisar', 'Menú'],
  }[sesion.usuario.rol] || ['Menú'];
  $('#chat-sug', vista).innerHTML = SUG.map((s) => html`<button type="button" class="chip" data-s="${s}">${s}</button>`).join('');
  $('#chat-sug', vista).addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (b) enviar({ texto: b.dataset.s }).catch((er) => aviso(er.message, 'error'));
  });

  // Al abrir la app desde el ícono, se actualiza lo que haya llegado mientras tanto
  sondeo = setInterval(() => {
    if (!document.body.contains(lista)) return clearInterval(sondeo);
    if (!document.hidden) api.get(`/api/chat/historial?despues=${ultimo}`).then(agregar).catch(() => {});
  }, 15000);

  const crece = () => { caja.style.height = 'auto'; caja.style.height = `${Math.min(caja.scrollHeight, 140)}px`; };
  caja.addEventListener('input', crece);
  caja.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = caja.value.trim();
    if (!texto) return;
    caja.value = ''; crece();
    try { await enviar({ texto }); } catch (er) { aviso(er.message, 'error'); caja.value = texto; }
  });

  lista.addEventListener('click', (e) => {
    const leer = e.target.closest('[data-leer]');
    if (leer && 'speechSynthesis' in window) {
      const voz = new SpeechSynthesisUtterance(leer.dataset.leer.replace(/[*•]/g, '').replace(/\p{Extended_Pictographic}/gu, ''));
      voz.lang = 'es-PE'; speechSynthesis.cancel(); speechSynthesis.speak(voz);
    }
  });

  const adjunto = $('#chat-archivo', vista);
  $('#chat-adj', vista).addEventListener('click', () => adjunto.click());
  adjunto.addEventListener('change', async () => {
    const f = adjunto.files[0]; adjunto.value = '';
    if (!f) return;
    if (f.size > 1_500_000) return aviso('El archivo pesa más de 1,5 MB', 'error');
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
    const pie = caja.value.trim(); caja.value = ''; crece();
    try { await enviar({ archivo_b64: b64, mime: f.type || 'application/octet-stream', nombre: f.name, texto: pie }); } catch (er) { aviso(er.message, 'error'); }
  });

  microfono($('#chat-mic', vista), enviar);
}

function microfono(boton, enviar) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { boton.disabled = true; return; }
  let grabadora = null, rec = null, texto = '', corte = null;
  const parar = () => { clearTimeout(corte); rec?.stop(); if (grabadora?.state === 'recording') grabadora.stop(); };
  boton.addEventListener('click', async () => {
    if (grabadora?.state === 'recording') return parar();
    let flujo;
    try { flujo = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return aviso('No diste permiso para usar el micrófono', 'error'); }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    const trozos = []; texto = '';
    grabadora.ondataavailable = (e) => e.data.size && trozos.push(e.data);
    grabadora.onstop = async () => {
      flujo.getTracks().forEach((t) => t.stop());
      boton.classList.remove('grabando'); boton.textContent = '🎤';
      const blob = new Blob(trozos, { type: grabadora.mimeType || 'audio/webm' });
      if (blob.size < 1500) return aviso('El audio salió muy corto', 'error');
      await new Promise((r) => setTimeout(r, 400));
      const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      try { await enviar({ audio_b64: b64, mime: blob.type.split(';')[0], transcripcion: texto.trim() }); } catch (er) { aviso(er.message, 'error'); }
    };
    if (Rec) {
      rec = new Rec(); rec.lang = 'es-PE'; rec.continuous = true; rec.interimResults = false;
      rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) texto += ` ${e.results[i][0].transcript}`; };
      rec.onerror = () => {};
      try { rec.start(); } catch { /* ya iniciado */ }
    }
    grabadora.start();
    boton.classList.add('grabando'); boton.textContent = '■';
    corte = setTimeout(parar, MAX_SEGUNDOS * 1000);
  });
}
