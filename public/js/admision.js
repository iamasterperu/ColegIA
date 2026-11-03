// Chat público de admisión: sin cuenta. Un identificador anónimo se guarda en este navegador.
const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const $ = (s) => document.querySelector(s);
const msgs = $('#msgs');
let ultimo = 0;
let visitante = '';
try { visitante = localStorage.getItem('colegia_visitante') || ''; } catch { /* sin almacenamiento */ }
if (!/^[a-f0-9]{32}$/.test(visitante)) {
  visitante = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem('colegia_visitante', visitante); } catch { /* sin almacenamiento */ }
}
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => esc(t || '').replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function agregar(ms) {
  for (const m of ms) {
    if (m.id <= ultimo) continue;
    ultimo = m.id;
    msgs.insertAdjacentHTML('beforeend', `<div class="b ${m.sentido === 'entrante' ? 'mio' : 'bot'}">${fmt(m.texto)}</div>`);
  }
  msgs.scrollTop = msgs.scrollHeight;
}
async function enviar(texto) {
  const pens = document.createElement('div'); pens.className = 'b bot'; pens.textContent = 'Escribiendo…'; msgs.append(pens); msgs.scrollTop = msgs.scrollHeight;
  try {
    const r = await fetch(`/api/publico/admision/${encodeURIComponent(slug)}/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-colegia': '1' },
      body: JSON.stringify({ visitante, texto, despues: ultimo }),
    });
    const d = await r.json();
    pens.remove();
    if (!r.ok) { msgs.insertAdjacentHTML('beforeend', `<div class="b bot">${esc(d.error || 'No se pudo enviar')}</div>`); return; }
    agregar(d.mensajes);
  } catch { pens.remove(); msgs.insertAdjacentHTML('beforeend', '<div class="b bot">Sin conexión. Intenta de nuevo.</div>'); }
}
const SUG = ['Pensiones y matrícula', 'Horarios', 'Requisitos de admisión', 'Agendar una visita', 'Hablar con secretaría'];
$('#sug').innerHTML = SUG.map((s) => `<button type="button">${s}</button>`).join('');
$('#sug').addEventListener('click', (e) => { if (e.target.matches('button')) enviar(e.target.textContent); });
$('#f').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#t').value.trim(); if (!t) return;
  $('#t').value = ''; $('#t').style.height = 'auto'; enviar(t);
});
$('#t').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; });
(async () => {
  try {
    const r = await fetch(`/api/publico/admision/${encodeURIComponent(slug)}`);
    if (!r.ok) { msgs.innerHTML = '<div class="b bot">Este enlace no es válido.</div>'; $('#f').remove(); $('#sug').remove(); return; }
    const c = await r.json();
    $('#nombre').textContent = c.nombre; document.title = c.nombre; $('#logo').textContent = c.nombre[0];
    if (/^#[0-9a-f]{6}$/i.test(c.color_primario || '')) document.documentElement.style.setProperty('--marca', c.color_primario);
    if (/^#[0-9a-f]{6}$/i.test(c.color_secundario || '')) document.documentElement.style.setProperty('--sec', c.color_secundario);
  } catch { /* se mantiene el diseño base */ }
  enviar('hola');
})();

$('#t').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } });
