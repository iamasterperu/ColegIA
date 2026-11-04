# Genera public/colegia.html (la página pública de ColegIA) a partir de scripts/roles.py y assets/colegia-logo.png
import base64, html, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from roles import ROLES, ETAPAS
e = html.escape
logo = base64.b64encode(open('assets/colegia-logo.png', 'rb').read()).decode()
COL = {"VIO": "#6C3BFF", "MINT": "#16B894", "AMB": "#E59A00", "CORAL": "#E5484D"}

def lista(items): return ''.join(f'<li>{e(i)}</li>' for i in items)
roles = ''.join(f'''
  <article class="rol" style="--c:{COL[r["color"]]}">
    <h3>{e(r["nombre"])}</h3>
    <div class="dos">
      <div><h4>En el piloto de 30 días</h4><ul>{lista(r["piloto"])}</ul></div>
      <div><h4>Después del contrato</h4><ul>{lista(r["contrato"])}</ul></div>
    </div>
  </article>''' for r in ROLES)
etapas = ''.join(f'<li><b>{e(t)}</b><span>{e(s)}</span><p>{e(d)}</p></li>' for t, s, d in ETAPAS)

page = f'''<!doctype html>
<html lang="es-PE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ColegIA · El chat privado de tu colegio</title>
<meta name="description" content="ColegIA es el chat privado de tu colegio, instalado en el celular: atiende a las familias, ayuda a secretaría, dirección y docentes, y se prueba 30 días sin datos de alumnos. Precio fijo mensual por colegio.">
<meta property="og:title" content="ColegIA · El chat privado de tu colegio">
<meta property="og:description" content="Admisiones, informes, comunicados, cobranza amable y apoyo docente. Demo de 30 días sin datos de alumnos.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{{--navy:#0B1F3A;--navy2:#132B4F;--vio:#6C3BFF;--mint:#16B894;--amb:#FFB020;--ink:#1B2333;--muted:#5E6778;--line:#E4E7EE;--bg:#F7F8FB;--w:#fff}}
*{{box-sizing:border-box}}
body{{margin:0;font:16px/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);background:var(--w)}}
a{{color:inherit}}
.wrap{{max-width:1040px;margin:0 auto;padding-inline:max(18px,env(safe-area-inset-left))}}
.hero{{background:var(--navy);color:#fff;padding-block:28px 64px;position:relative;overflow:hidden}}
.hero::after{{content:"";position:absolute;right:-120px;top:-120px;width:380px;height:380px;border-radius:50%;background:var(--vio);opacity:.9}}
.hero .wrap{{position:relative;z-index:1}}
.top{{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}}
.top img{{height:44px;width:auto;display:block}}
.top a.m{{font-size:14px;opacity:.85;text-decoration:none}}
h1{{font-size:clamp(30px,5.2vw,52px);line-height:1.08;margin:48px 0 14px;max-width:16em;letter-spacing:-.02em}}
.lead{{font-size:clamp(17px,2.2vw,20px);max-width:36em;color:#D5DDEA;margin:0 0 26px}}
.btns{{display:flex;gap:12px;flex-wrap:wrap}}
.btn{{display:inline-block;padding:13px 22px;border-radius:10px;font-weight:700;text-decoration:none;border:2px solid transparent}}
.btn.p{{background:var(--mint);color:#06281f}}
.btn.s{{border-color:#5d7399;color:#fff}}
.btn.w{{background:#25d366;color:#052e16;font-size:1.1rem;padding:16px 26px;box-shadow:0 6px 22px rgba(37,211,102,.45)}}
.btn.i{{background:#f59e0b;color:#1b2333;font-size:1.1rem;padding:16px 26px;box-shadow:0 6px 22px rgba(245,158,11,.45)}}
.top .inst{{margin-left:auto;background:#f59e0b;color:#1b2333;font-weight:800;border-radius:999px;padding:9px 16px;text-decoration:none;font-size:.92rem}}
.note{{font-size:13.5px;color:#9FB0CC;margin-top:14px;max-width:38em}}
section{{padding-block:56px}}
section.alt{{background:var(--bg)}}
h2{{font-size:clamp(24px,3.4vw,34px);line-height:1.15;margin:0 0 10px;letter-spacing:-.01em;color:var(--navy)}}
.sub{{color:var(--muted);max-width:40em;margin:0 0 28px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}}
.card{{background:var(--w);border:1px solid var(--line);border-radius:14px;padding:18px}}
.card h3{{margin:0 0 6px;font-size:17px;color:var(--navy)}}
.card p{{margin:0;color:var(--muted);font-size:15px}}
.rol{{background:var(--w);border:1px solid var(--line);border-left:6px solid var(--c);border-radius:14px;padding:20px;margin-bottom:16px}}
.rol h3{{margin:0 0 12px;font-size:20px;color:var(--navy)}}
.dos{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}}
.dos>div{{min-width:0}}
.rol h4{{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--c)}}
.rol ul{{margin:0;padding-left:18px;font-size:15px}}
.rol li{{margin-bottom:5px}}
.etapas{{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;counter-reset:e}}
.etapas li{{background:var(--w);border:1px solid var(--line);border-radius:14px;padding:18px;counter-increment:e}}
.etapas li::before{{content:counter(e);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--vio);color:#fff;font-weight:700;margin-bottom:10px}}
.etapas b{{display:block;color:var(--navy)}} .etapas span{{display:block;font-size:13px;color:var(--vio);font-weight:700;margin-bottom:6px}}
.etapas p{{margin:0;font-size:14.5px;color:var(--muted)}}
.seg{{background:var(--navy);color:#fff}}
.seg h2{{color:#fff}} .seg .sub{{color:#C7D0E0}}
.seg ul{{margin:0;padding-left:20px;max-width:46em}} .seg li{{margin-bottom:8px}}
.cta{{text-align:center}}
.planes{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}}
.plan{{background:var(--w);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:6px}}
.plan b{{font-size:.95rem;color:var(--navy)}} .plan span{{font-size:1.5rem;font-weight:800;color:var(--vio)}} .plan small{{font-size:.8rem;font-weight:500;color:var(--muted)}}
.cta .btns{{justify-content:center}}
footer{{padding-block:26px;font-size:13.5px;color:var(--muted);text-align:center;border-top:1px solid var(--line)}}
:focus-visible{{outline:3px solid var(--amb);outline-offset:2px}}
</style>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><meta name="theme-color" content="#1e3a8a">
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="top"><img src="data:image/png;base64,{logo}" alt="ColegIA"><a class="m" href="#contacto">Contacto</a><a class="inst" href="/entrar?instalar=1">📲 Instalar</a></div>
    <h1>El chat privado de tu colegio</h1>
    <p class="lead">Una app instalable en el celular, con su propio chat inteligente. Atiende a las familias a cualquier hora, ayuda a secretaría, dirección y docentes, y se prueba 30 días sin entregar datos de alumnos.</p>
    <div class="btns"><a class="btn w" href="/entrar?instalar=1">📲 Instalar la app</a><a class="btn i" href="/entrar">Ingresar a mi colegio</a><a class="btn s" href="#roles">Qué hace cada persona</a></div>
    <p class="note">Instálala en tu celular (Android o iPhone) y entra con tu DNI una sola vez: la app reconoce si eres padre, profesor, dirección, secretaría o contabilidad.</p>
  </div>
</header>

<section><div class="wrap">
  <h2>Menos llamadas, menos papeles, más tiempo para enseñar</h2>
  <p class="sub">Es como WhatsApp, pero del colegio: se instala en el celular, entras una sola vez con tu DNI y la app reconoce si eres padre, profesor, dirección, secretaría o contabilidad. Escribes, hablas o mandas una foto, y cada rol tiene su panel de control. Sin cuentas de Meta.</p>
  <div class="grid">
    <div class="card"><h3>Admisiones</h3><p>Cada colegio tiene un enlace y un código QR de información: las familias nuevas entran sin crear cuenta, reciben pensiones, horarios y requisitos con lo que el colegio aprobó, y dejan su nombre y celular para agendar la visita.</p></div>
    <div class="card"><h3>Informes y comunicados</h3><p>Calendario, útiles y trámites al instante. La dirección redacta, elige a quién va, revisa y confirma.</p></div>
    <div class="card"><h3>Cobranza amable</h3><p>Recordatorios antes y después del vencimiento, vouchers por foto y boletas o facturas con el proveedor del colegio.</p></div>
    <div class="card"><h3>Apoyo docente</h3><p>Exámenes con versión A y B, sesiones de clase y material adaptado en minutos.</p></div>
  </div>
</div></section>

<section class="alt" id="roles"><div class="wrap">
  <h2>Qué hace cada persona del colegio</h2>
  <p class="sub">Primero un piloto de 30 días con información pública del colegio. Si el colegio decide seguir, se activan las demás funciones.</p>
  {roles}
</div></section>

<section><div class="wrap">
  <h2>Cómo empezamos</h2>
  <p class="sub">Cada etapa pide solo lo necesario. El colegio decide cuándo pasar a la siguiente.</p>
  <ol class="etapas">{etapas}</ol>
</div></section>

<section class="seg"><div class="wrap">
  <h2>Datos protegidos desde el primer día</h2>
  <p class="sub">Pensado para la Ley 29733 de Protección de Datos Personales.</p>
  <ul>
    <li>El piloto no usa listas de alumnos, datos de padres, notas, DNI ni claves.</li>
    <li>El chat es privado: cada persona entra con su cuenta y solo ve lo que su rol permite. No se necesita WhatsApp ni cuenta de Meta.</li>
    <li>Dirección, secretaría y contabilidad pueden crear su propia contraseña: nadie se la entrega y, una vez creada, entran con DNI, celular y contraseña.</li>
    <li>Las familias autorizan el uso de sus datos y pueden retirarlo cuando quieran. WhatsApp queda como extra opcional.</li>
    <li>Cada consulta de datos personales queda registrada, y cada rol ve solo lo que necesita.</li>
    <li>Nunca se pide la clave SOL.</li>
  </ul>
</div></section>

<section class="alt" id="planes"><div class="wrap">
  <h2>Planes mensuales</h2>
  <p class="sub">Todo incluido en cada plan: chat, panel por cargo, admisión, cobranza, exámenes y avisos al celular. El precio depende de cuántos alumnos tiene el colegio, no de cuánto lo usa.</p>
  <div class="planes">
    <div class="plan"><b>Hasta 100 alumnos</b><span>S/ 149 <small>al mes</small></span></div>
    <div class="plan"><b>Hasta 200 alumnos</b><span>S/ 249 <small>al mes</small></span></div>
    <div class="plan"><b>Hasta 300 alumnos</b><span>S/ 349 <small>al mes</small></span></div>
    <div class="plan"><b>Hasta 400 alumnos</b><span>S/ 449 <small>al mes</small></span></div>
    <div class="plan"><b>Hasta 500 alumnos</b><span>S/ 549 <small>al mes</small></span></div>
    <div class="plan"><b>Más de 500 alumnos</b><span>Se cotiza</span></div>
  </div>
  <p class="note" style="color:var(--muted)">Los primeros 30 días son gratis y sin datos de alumnos.</p>
</div></section>

<section class="cta" id="contacto"><div class="wrap">
  <h2>Pruébalo con tu colegio</h2>
  <p class="sub" style="margin-inline:auto">Prueba 30 días gratis. Después, un precio fijo mensual según el tamaño del colegio.</p>
  <div class="btns"><a class="btn p" href="/entrar" style="background:var(--navy);color:#fff">Ingresar a mi colegio</a><a class="btn s" href="mailto:iamasterperu@gmail.com" style="border-color:var(--navy);color:var(--navy)">iamasterperu@gmail.com</a></div>
  <p class="note" style="color:var(--muted);margin-inline:auto">IAMASTER · Lima, Perú</p>
</div></section>
<footer>ColegIA es una creación de <a href="https://iamaster.iamasterperu.workers.dev/">IAMASTER</a>.</footer>
</body>
</html>'''
open('public/colegia.html', 'w').write(page)
print(len(page))
