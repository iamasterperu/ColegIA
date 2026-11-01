-- DNI del personal (para reconocer a cada persona al cargar cumpleaños desde Excel o foto del DNI)
ALTER TABLE usuarios ADD COLUMN dni TEXT;
ALTER TABLE personal ADD COLUMN dni TEXT;
