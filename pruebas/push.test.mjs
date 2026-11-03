import { crearDB } from './d1shim.mjs';
import { readdirSync } from 'node:fs';
import { claves, firmaVapid, avisarPush } from '../src/lib/push.js';
import { copiarAlBuzon } from '../src/lib/buzon.js';
import assert from 'node:assert/strict';
const DB = crearDB(readdirSync('migrations').sort().map((f) => 'migrations/' + f));
const env = { DB, URL_BASE: 'https://x.pe' };
DB._raw.exec(`INSERT INTO colegios (id, slug, nombre) VALUES (1,'c','C');
 INSERT INTO usuarios (id, colegio_id, nombre, email, rol, clave) VALUES (1,1,'Ana','a@x.pe','direccion','x'),(2,1,'Luis','l@x.pe','profesor','x');
 INSERT INTO push_suscripciones (colegio_id, usuario_id, endpoint) VALUES (1,1,'https://push.example/a'),(1,1,'https://push.example/gone');`);
// claves: se generan una vez y se reutilizan
const k1 = await claves(env), k2 = await claves(env);
assert.equal(k1.publica, k2.publica); assert.equal(Buffer.from(k1.publica, 'base64url').length, 65);
// la firma VAPID es un ES256 válido con esa clave pública
const { jwt } = await firmaVapid(env, 'https://push.example/a');
const [h, c, s] = jwt.split('.');
const pub = await crypto.subtle.importKey('raw', Buffer.from(k1.publica, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`)), 'firma válida');
assert.equal(JSON.parse(Buffer.from(c, 'base64url')).aud, 'https://push.example');
// envío: llama a cada celular y borra el que ya no existe (410)
const llamadas = [];
globalThis.fetch = async (url, o) => { llamadas.push([url, o.headers.authorization.startsWith('vapid t=')]); return new Response(null, { status: url.endsWith('gone') ? 410 : 201 }); };
await avisarPush(env, 1);
assert.equal(llamadas.length, 2); assert.ok(llamadas.every((x) => x[1]));
assert.equal(DB._raw.prepare('SELECT COUNT(*) n FROM push_suscripciones').get().n, 1, 'suscripción muerta eliminada');
// un aviso del colegio al usuario dispara el push
llamadas.length = 0;
await copiarAlBuzon(env, 1, { usuarioId: 1, telefono: '51999', texto: 'x' }, 'Recordatorio de pago');
assert.equal(llamadas.length, 1, 'el aviso al buzón envía push');
console.log('OK push');
