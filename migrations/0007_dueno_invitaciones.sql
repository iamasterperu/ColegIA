-- Panel privado del dueño de la plataforma, enlaces para que cada persona cree su contraseña y
-- colegios que se pueden suspender u ocultar de la lista de ingreso.
ALTER TABLE colegios ADD COLUMN suspendido INTEGER NOT NULL DEFAULT 0;
ALTER TABLE colegios ADD COLUMN mostrar_en_ingreso INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS duenos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL UNIQUE, clave TEXT NOT NULL DEFAULT 'pendiente',
  activo INTEGER NOT NULL DEFAULT 1, ultimo_acceso TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS dueno_sesiones (id TEXT PRIMARY KEY, dueno_id INTEGER NOT NULL REFERENCES duenos(id), expira TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitaciones (id TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('usuario','dueno')), ref_id INTEGER NOT NULL,
  expira TEXT NOT NULL, usado INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
