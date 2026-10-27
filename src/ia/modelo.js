// Acceso a Workers AI. Todo el texto que genera la IA pasa por aquí para tener un
// solo lugar con los modelos, límites y manejo de errores.
export const MODELOS = {
  rapido: '@cf/meta/llama-3.1-8b-instruct-fast', // clasificar intenciones
  experto: '@cf/meta/llama-4-scout-17b-16e-instruct', // exámenes, tutor, sesiones, lectura de imágenes
  voz: '@cf/openai/whisper-large-v3-turbo',
};

export class SinIA extends Error {}

export function hayIA(env) {
  return !!env.AI;
}

async function correr(env, modelo, entrada) {
  if (!env.AI) throw new SinIA('La inteligencia artificial no está activada');
  const r = await env.AI.run(modelo, entrada);
  return typeof r?.response === 'string' ? r.response : typeof r?.response === 'object' ? JSON.stringify(r.response) : String(r?.response ?? '');
}

export async function generarTexto(env, sistema, usuario, { maxTokens = 1200, temperatura = 0.4, modelo = MODELOS.experto } = {}) {
  return (await correr(env, modelo, {
    messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
    max_tokens: maxTokens, temperature: temperatura,
  })).trim();
}

// Pide JSON y lo extrae aunque el modelo agregue texto alrededor
export async function generarJson(env, sistema, usuario, opciones = {}) {
  const texto = await generarTexto(env, `${sistema}\nResponde SOLO con JSON válido, sin texto antes ni después.`, usuario, { temperatura: 0.3, ...opciones });
  return extraerJson(texto);
}

export function extraerJson(texto) {
  const limpio = String(texto).replace(/```(?:json)?/g, '');
  const inicio = limpio.search(/[[{]/);
  if (inicio < 0) throw new Error('La IA no devolvió datos');
  const apertura = limpio[inicio];
  const cierre = apertura === '{' ? '}' : ']';
  const fin = limpio.lastIndexOf(cierre);
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

// Conversación con historial (tutor)
export async function conversar(env, sistema, historial, { maxTokens = 500, temperatura = 0.5 } = {}) {
  return (await correr(env, MODELOS.experto, {
    messages: [{ role: 'system', content: sistema }, ...historial], max_tokens: maxTokens, temperature: temperatura,
  })).trim();
}

const aBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// Lee una imagen (foto de lista, voucher, ficha, ejercicio) y responde según la instrucción
export async function leerImagen(env, imagen, instruccion, { json = false, maxTokens = 1500 } = {}) {
  const url = `data:${imagen.mime || 'image/jpeg'};base64,${aBase64(new Uint8Array(imagen.datos))}`;
  const texto = await correr(env, MODELOS.experto, {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: json ? `${instruccion}\nResponde SOLO con JSON válido.` : instruccion },
        { type: 'image_url', image_url: { url } },
      ],
    }],
    max_tokens: maxTokens, temperature: 0.1,
  });
  return json ? extraerJson(texto) : texto.trim();
}

export async function transcribir(env, audio) {
  if (!env.AI) return null;
  try {
    const r = await env.AI.run(MODELOS.voz, { audio: aBase64(new Uint8Array(audio.datos)), language: 'es' });
    return (r?.text || '').trim() || null;
  } catch {
    return null;
  }
}
