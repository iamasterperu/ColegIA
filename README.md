# ColegIA
Asistente para colegios por WhatsApp y panel web. Worker de Cloudflare + D1 + Workers AI.
- `src/` Worker (API, webhook de WhatsApp, agente por roles). `public/` app web.
- `npm run dev` prueba local · `npm run deploy` publica. Secretos: `MASTER_KEY` (wrangler secret put).
- `migrations/0000_esquema_base.sql` es la instantánea del esquema ya aplicado en producción.
