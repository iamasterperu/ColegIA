-- Notificaciones push del chat (aviso en el celular aunque la app esté cerrada)
CREATE TABLE push_config (id INTEGER PRIMARY KEY CHECK (id = 1), publica TEXT NOT NULL, privada TEXT NOT NULL);
CREATE TABLE push_suscripciones (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  endpoint TEXT NOT NULL UNIQUE, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_push_usuario ON push_suscripciones (usuario_id);
