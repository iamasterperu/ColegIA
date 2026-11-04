-- Diagnóstico de avisos: resultado del último envío a cada celular
ALTER TABLE push_suscripciones ADD COLUMN ultimo_estado TEXT;
ALTER TABLE push_suscripciones ADD COLUMN ultimo_envio TEXT;
