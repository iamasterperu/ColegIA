// Material de origen para exámenes y sesiones: un PDF que manda el profesor o una página web.
// Se convierte en texto y de ahí sale el examen. Nunca se guarda el archivo original.
export const urlEnTexto = (texto) => String(texto || '').match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,;)]+$/, '') || null;

const privada = (host) => /^(localhost|.*\.local|.*\.internal)$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');

export async function leerWeb(url, llamar = fetch) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || privada(u.hostname)) throw new Error('Solo se pueden leer páginas web públicas con https.');
  const resp = await llamar(u.href, { headers: { 'user-agent': 'ColegIA/1.0 (+lectura de material escolar)', accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`La página respondió ${resp.status}.`);
  const tipo = resp.headers.get('content-type') || '';
  if (!/text\/(html|plain)/i.test(tipo)) throw new Error('Esa dirección no es una página de texto.');
  const bruto = (await resp.text()).slice(0, 600_000);
  const limpio = bruto
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
  if (limpio.length < 80) throw new Error('No encontré texto suficiente en esa página.');
  return limpio.slice(0, 6000);
}

export async function leerPdf(env, documento) {
  if (!env.AI?.toMarkdown) throw new Error('No puedo leer PDF en este momento.');
  const blob = new Blob([documento.datos], { type: documento.mime || 'application/pdf' });
  const r = await env.AI.toMarkdown([{ name: documento.nombre || 'material.pdf', blob }]);
  const texto = String(r?.[0]?.data || '').replace(/\s+\n/g, '\n').trim();
  if (texto.length < 80) throw new Error('El PDF no tiene texto legible (¿es una foto escaneada?).');
  return texto.slice(0, 6000);
}

export const esPdf = (d) => /pdf/i.test(d?.mime || '') || /\.pdf$/i.test(d?.nombre || '');
