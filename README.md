# ColegIA
Asistente para colegios por WhatsApp y panel web. Worker de Cloudflare + D1 + Workers AI.
- `src/` Worker (API, webhook de WhatsApp, agente por roles). `public/` app web.
- `npm run dev` prueba local · `npm run deploy` publica. Secretos: `MASTER_KEY` (wrangler secret put).
- `migrations/0000_esquema_base.sql` es la instantánea del esquema ya aplicado en producción.

## Novedades (octubre 2026)
- Admisiones por WhatsApp (familias no registradas), informes generales y preguntas frecuentes aprobadas.
- Pantallas "Admisiones" e "Información del colegio" (incluye RUC validado y checklist de la demo de 30 días).
- Antes de publicar: aplicar `migrations/0001_admision_informes_demo.sql` a la base D1 (`npx wrangler d1 execute colegia --remote --file migrations/0001_admision_informes_demo.sql`).
- Pruebas locales: `node --experimental-sqlite pruebas/familia.test.mjs`.
