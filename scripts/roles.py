# Qué hace cada persona del colegio, en el piloto de 30 días y después del contrato.
# Fuente única para la web de ColegIA y los PDF. Todo está respaldado por lo que la app ya hace,
# salvo lo marcado "por desarrollar".
ROLES = [
 {"id": "direccion", "nombre": "Dirección", "color": "VIO",
  "piloto": [
   "Ajusta la información que responde el asistente: pensiones, horarios, calendario, requisitos y preguntas frecuentes.",
   "Ve en el panel a las familias interesadas y las visitas que se agendaron por WhatsApp.",
   "Pide por WhatsApp un comunicado ya redactado o traducido, para copiarlo y enviarlo como siempre.",
   "Crea exámenes con versión A y B, y planifica sesiones, igual que un docente.",
   "Prueba con datos ficticios cómo se vería el resumen de morosidad, los alumnos en riesgo y los comunicados."],
  "contrato": [
   "Resumen del colegio, deuda por grado y por aula, y alumnos en riesgo (alerta temprana).",
   "Comunicados a todos los padres, con vista previa, confirmación y registro de quién los leyó.",
   "Resumen diario por WhatsApp a las 8 a. m. de lunes a viernes.",
   "Registro de quién consultó datos de alumnos y atención de solicitudes ARCO (Ley 29733)."]},
 {"id": "secretaria", "nombre": "Secretaría", "color": "MINT",
  "piloto": [
   "Atiende a las familias interesadas: ve quién escribió y a quién debe llamar.",
   "Gestiona las visitas agendadas y marca cuáles se realizaron.",
   "Sube la lista de útiles por grado, en foto o Excel, para que el asistente la informe.",
   "Mantiene las preguntas frecuentes y el calendario del año.",
   "Traduce comunicados."],
  "contrato": [
   "Busca a cualquier alumno y sus contactos con solo escribir su nombre.",
   "Carga fichas de matrícula y listas desde una foto o un Excel.",
   "Avisa a un grado completo y a cada padre los útiles que le faltan.",
   "Bandeja de mensajes de padres por atender y autorizaciones de WhatsApp pendientes.",
   "Constancias y diplomas con el diseño del colegio, reinscripción y carta de presentación para familias nuevas."]},
 {"id": "contabilidad", "nombre": "Contabilidad", "color": "AMB",
  "piloto": [
   "Ve la demostración con datos ficticios: morosos, registro de pagos, recordatorios y vouchers.",
   "Acuerda qué proveedor de boletas y facturas usará el colegio. En el piloto no se carga cobranza real.",
   "Nunca se pide la clave SOL."],
  "contrato": [
   "Resumen de cobranza, lista de morosos y deuda de cada alumno.",
   "Registra pagos por Yape, Plin, transferencia, efectivo o tarjeta.",
   "Recordatorios amables antes y después del vencimiento, también automáticos.",
   "Los padres mandan la foto del voucher y contabilidad lo confirma o rechaza.",
   "Boletas y facturas electrónicas con Nubefact, al activar el contrato."]},
 {"id": "docentes", "nombre": "Docentes", "color": "CORAL",
  "piloto": [
   "Exámenes con versión A y B y solucionario, a partir de un tema, el sílabo o la foto de una página.",
   "Sesiones de clase planificadas en minutos.",
   "Material adaptado para alumnos con TDAH, dislexia u otras necesidades, sin usar nombres.",
   "Traducción de textos y comunicados.",
   "Solo hace falta registrar su nombre y celular."],
  "contrato": [
   "Toma de lista por WhatsApp: se registra sola y la directora recibe el resumen diario.",
   "Notas por texto o por la foto del registro.",
   "Resultados del examen por pregunta y radar de temas débiles del aula.",
   "Alumnos en riesgo, alertas de salud y justificaciones de sus padres.",
   "Aviso a los padres de su aula y registro de útiles entregados.",
   "Los exámenes que crea quedan registrados (curso, profesor y clase) y se reportan a la directora."]},
 {"id": "auxiliares", "nombre": "Auxiliares", "color": "VIO",
  "piloto": [
   "Sin uso en el piloto: sus tareas dependen de la lista de alumnos."],
  "contrato": [
   "Rol propio con permisos acotados: asistencia, tardanzas, justificaciones y alertas de salud de su aula (por desarrollar).",
   "Mientras tanto pueden usar el acceso de docente si el colegio se lo da."]},
 {"id": "padres", "nombre": "Padres y familias", "color": "MINT",
  "piloto": [
   "Las familias nuevas preguntan por pensiones, horarios y requisitos, y agendan su visita por WhatsApp.",
   "Cualquier familia consulta calendario, horarios, trámites y preguntas frecuentes, a cualquier hora.",
   "El asistente solo responde lo que el colegio aprobó. Si no lo sabe, deriva a secretaría.",
   "Guarda nombre y celular solo si la familia los da, con aviso de privacidad."],
  "contrato": [
   "Deuda y cómo pagar, con envío de la foto del voucher.",
   "Lista de útiles de su hijo y lo que falta.",
   "Notas, asistencia y justificación de faltas.",
   "Comunicados con confirmación de lectura y recordatorios de pago.",
   "Hablar con secretaría, y ver o retirar sus autorizaciones.",
   "Saludo de cumpleaños para su hijo y para ellos, y comunicados por fechas especiales."]},
 {"id": "alumnos", "nombre": "Alumnos", "color": "AMB",
  "piloto": [
   "No participan. Opcional: el test vocacional Rumbo para 4.° y 5.° de secundaria, con resultados que se quedan en su dispositivo."],
  "contrato": [
   "Tutor de IA que guía con preguntas y no da la respuesta, solo con autorización del apoderado.",
   "El docente ve en qué temas se trabó cada alumno."]},
 {"id": "otros", "nombre": "Tutoría, psicología y otros", "color": "CORAL",
  "piloto": [
   "Sin uso en el piloto."],
  "contrato": [
   "Los tutores reciben cada lunes la alerta temprana de su aula por WhatsApp.",
   "Dirección comparte con psicología los alumnos en riesgo.",
   "Portería y administración no necesitan usar la app."]},
]
ETAPAS = [
 ("Piloto de 30 días", "Sin datos de alumnos ni de padres",
  "Solo información pública del colegio. El colegio envía lo que ya entrega a las familias y el asistente responde con eso."),
 ("Contrato", "Se activa el WhatsApp del colegio",
  "Número de WhatsApp Business del colegio, lista de apoderados con su autorización, comunicados a todas las familias y avisos de pago."),
 ("Cobranza y comprobantes", "Con el proveedor que el colegio ya use",
  "Cobranza amable y boletas o facturas electrónicas. Nunca se pide la clave SOL."),
 ("Notas y refuerzo", "Con autorización de las familias",
  "Notas por alumno desde la foto del registro y refuerzo por grupo."),
]
