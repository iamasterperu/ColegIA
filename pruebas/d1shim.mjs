// Simula D1 con node:sqlite para probar la lógica sin Cloudflare.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function crearDB(archivos) {
  const db = new DatabaseSync(':memory:');
  for (const a of archivos) db.exec(readFileSync(a, 'utf8'));
  const sent = (sql, params = []) => ({
    bind: (...p) => sent(sql, p),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    _ejecutar: () => (/^\s*(select|with)/i.test(sql) || /returning/i.test(sql) ? { results: db.prepare(sql).all(...params), meta: {} } : (() => { const r = db.prepare(sql).run(...params); return { results: [], meta: { changes: Number(r.changes) } }; })()),
  });
  return { prepare: (s) => sent(s), batch: async (xs) => xs.map((x) => x._ejecutar()), _raw: db };
}
