/* Página pública para que los clientes envíen su trabajo. */
const app = document.getElementById('app');
const tok = (location.hash.slice(1) || new URLSearchParams(location.search).get('t') || '').trim();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + (c / 100).toFixed(2);
const CATS = { color: 'Color', bn: 'Blanco y negro', planos: 'Planos', enc: 'Encuadernación', otros: 'Otros' };
let N = null, lineas = [], archivos = [], enviando = false;

const tramo = (t, p) => { if (!t.tramos) return null; let d = 1; for (const x of t.tramos) { if (p <= x.hasta) return { ...x, desde: d }; d = x.hasta + 1; } return null; };
const precioDe = (s, t, pags) => t.tramos ? (tramo(t, pags)?.precio || 0) : t.precio;

async function init() {
  if (!/^[0-9a-f]{24}$/.test(tok)) return error('Este enlace no es válido. Pide el enlace correcto a la imprenta.');
  try {
    const r = await fetch(`/api/public/negocio?t=${tok}`);
    const d = await r.json();
    if (!r.ok) return error(d.error || 'No se pudo abrir el formulario');
    N = d; document.title = `Enviar trabajo · ${N.negocio}`; pintar();
  } catch { error('Sin conexión. Revisa el internet e intenta de nuevo.'); }
}
function error(t) { app.innerHTML = `<div class="card ok"><h2>Ups</h2><p class="muted">${esc(t)}</p></div>`; }

function pintar() {
  const servs = N.catalogo.filter(s => !s.libre);
  const grupos = Object.entries(CATS).map(([c, l]) => [l, servs.filter(s => s.cat === c)]).filter(([, v]) => v.length);
  app.innerHTML = `
  <div class="head">${N.logo ? `<img src="${esc(N.logo)}" alt="${esc(N.negocio)}">` : ''}<div><h1>${N.logo ? 'Envía tu trabajo' : esc(N.negocio)}</h1><p>${N.logo ? '' : 'Envía tu trabajo · '}Te avisamos cuando esté listo</p></div></div>
  <form id="f" novalidate>
    <div class="card">
      <div class="label">Tus datos</div>
      <div class="grid2">
        <div class="field span2"><label for="nombre">Nombre o empresa</label><input class="input" id="nombre" name="nombre" maxlength="80" autocomplete="name" required></div>
        <div class="field"><label for="tel">Celular</label><input class="input" id="tel" name="tel" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="6000-0000"></div>
        <div class="field"><label for="correo">Correo</label><input class="input" id="correo" name="correo" type="email" maxlength="120" autocomplete="email"></div>
      </div>
    </div>
    <div class="card">
      <div class="label">Qué necesitas</div>
      <div class="field"><label for="serv">Producto o servicio</label><select class="input" id="serv"><option value="">Elige…</option>${grupos.map(([l, v]) => `<optgroup label="${esc(l)}">${v.map(s => `<option value="${esc(s.id)}">${esc(s.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="addrow">
        <div class="field"><label for="tam">Tamaño</label><select class="input" id="tam" disabled><option value="">—</option></select></div>
        <div class="field"><label for="cant">Cantidad</label><input class="input" id="cant" type="number" inputmode="decimal" min="1" value="1"></div>
      </div>
      <div class="field hide" id="fpags" style="margin-top:10px"><label for="pags">Páginas del documento</label><input class="input" id="pags" type="number" inputmode="numeric" min="1"></div>
      <div class="field" style="margin-top:10px"><label for="det">Detalle (opcional)</label><input class="input" id="det" maxlength="200" placeholder="Doble cara, grapado, papel…"></div>
      <div class="est" id="est"></div>
      <button type="button" class="btn line block" id="add" style="margin-top:12px" disabled>Agregar</button>
      <div class="lines" id="lines"></div>
      <div class="tot hide" id="tot"><span>Total aproximado <small class="muted">(con ITBMS ${esc(N.itbms)}%)</small></span><b id="totv"></b></div>
    </div>
    <div class="card">
      <div class="label">Archivos</div>
      <label class="drop" for="arch"><b>Elegir archivos</b><span>PDF, Word o imágenes · hasta 15 MB cada uno</span></label>
      <input type="file" id="arch" multiple hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.tif,.tiff,.ai,.psd,.dwg,.zip,image/*,application/pdf">
      <div class="files" id="files"></div>
    </div>
    <div class="card">
      <div class="grid2">
        <div class="field span2"><label for="nota">Indicaciones (opcional)</label><textarea class="input" id="nota" name="nota" maxlength="1500" placeholder="Cuéntanos lo que necesitas"></textarea></div>
        <div class="field span2"><label for="entrega">Para cuándo (opcional)</label><input class="input" id="entrega" name="entrega" type="datetime-local"></div>
      </div>
    </div>
    <div class="err" id="err"></div>
    <button class="btn block big" id="enviar" type="submit">Enviar pedido</button>
    <p class="muted" style="text-align:center;font-size:13px;margin-top:12px">${[N.telefono && `Tel. ${esc(N.telefono)}`, N.correo && esc(N.correo)].filter(Boolean).join(' · ')}</p>
  </form>`;
  const $ = id => document.getElementById(id);
  const serv = () => N.catalogo.find(s => s.id === $('serv').value), tam = () => serv()?.tams.find(t => t.id === $('tam').value);
  const estimar = () => {
    const s = serv(), t = tam(), c = Number($('cant').value), p = Number($('pags').value);
    $('fpags').classList.toggle('hide', !t?.tramos);
    const ok = s && t && c > 0 && (!t.tramos || p > 0);
    $('add').disabled = !ok;
    const pr = s && t ? precioDe(s, t, p) : 0;
    $('est').textContent = !s || !t ? '' : t.tramos && !(p > 0) ? 'Escribe las páginas para ver el precio' : pr ? `${money(pr)} por ${s.unidad === 'pág' ? 'página' : s.unidad} · ${money(Math.round(pr * (c || 0)))} + ITBMS` : 'Precio a confirmar por la imprenta';
  };
  $('serv').addEventListener('change', () => {
    const s = serv();
    $('tam').innerHTML = s ? s.tams.map(t => `<option value="${esc(t.id)}">${esc(t.nombre)}${t.precio && !t.tramos ? ` · ${money(t.precio)}` : ''}</option>`).join('') : '<option value="">—</option>';
    $('tam').disabled = !s; estimar();
  });
  ['tam', 'cant', 'pags'].forEach(id => $(id).addEventListener('input', estimar));
  $('add').addEventListener('click', () => {
    const s = serv(), t = tam(); if (!s || !t) return;
    const pags = Number($('pags').value) || undefined;
    lineas.push({ serv: s.id, tam: t.id, cant: Number($('cant').value), paginas: t.tramos ? pags : undefined, detalle: $('det').value.trim(), nombre: s.nombre, tamano: t.nombre, precio: precioDe(s, t, pags || 0) });
    $('cant').value = 1; $('det').value = ''; $('pags').value = '';
    pintarLineas(); estimar();
  });
  $('lines').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { lineas.splice(Number(b.dataset.i), 1); pintarLineas(); } });
  $('arch').addEventListener('change', e => {
    for (const f of e.target.files) {
      if (archivos.length >= 5) { $('err').textContent = 'Máximo 5 archivos. Los demás envíalos por WhatsApp o correo.'; break; }
      if (f.size > 15 * 1048576) { $('err').textContent = `"${f.name}" pesa más de 15 MB. Envíalo por WhatsApp o correo.`; continue; }
      archivos.push(f);
    }
    e.target.value = ''; pintarArchivos();
  });
  $('files').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { archivos.splice(Number(b.dataset.f), 1); pintarArchivos(); } });
  $('f').addEventListener('submit', enviar);
}

function pintarLineas() {
  const el = document.getElementById('lines');
  el.innerHTML = lineas.map((l, i) => `<div class="ln"><span class="q">${esc(l.cant)}×</span><span class="d">${esc(l.nombre)}<small>${esc(l.tamano)}${l.paginas ? ` · ${l.paginas} págs` : ''}${l.detalle ? ` · ${esc(l.detalle)}` : ''}</small></span>
    <span>${l.precio ? money(Math.round(l.precio * l.cant)) : '<small>a confirmar</small>'}</span><button type="button" class="x" data-i="${i}" aria-label="Quitar">×</button></div>`).join('');
  const sub = lineas.reduce((a, l) => a + Math.round((l.precio || 0) * l.cant), 0);
  const tot = sub + Math.round(sub * Number(N.itbms) / 100);
  document.getElementById('tot').classList.toggle('hide', !sub);
  document.getElementById('totv').textContent = money(tot) + (lineas.some(l => !l.precio) ? '+' : '');
}
function pintarArchivos() {
  document.getElementById('files').innerHTML = archivos.map((f, i) => `<div class="file"><span>${esc(f.name)} <span class="muted">· ${(f.size / 1048576).toFixed(1)} MB</span></span><button type="button" data-f="${i}" aria-label="Quitar">×</button></div>`).join('');
}

async function enviar(e) {
  e.preventDefault();
  if (enviando) return;
  const $ = id => document.getElementById(id), err = $('err');
  err.textContent = '';
  const nombre = $('nombre').value.trim(), tel = $('tel').value.trim(), correo = $('correo').value.trim();
  if (!nombre) { err.textContent = 'Escribe tu nombre'; $('nombre').focus(); return; }
  if (tel.replace(/\D/g, '').length < 7 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { err.textContent = 'Escribe tu celular o tu correo para avisarte'; $('tel').focus(); return; }
  if (!lineas.length && !$('nota').value.trim() && !archivos.length) { err.textContent = 'Agrega lo que necesitas o cuéntanos en las indicaciones'; return; }
  const fd = new FormData();
  fd.append('t', tok); fd.append('nombre', nombre); fd.append('tel', tel); fd.append('correo', correo);
  fd.append('nota', $('nota').value.trim()); fd.append('entrega', $('entrega').value);
  fd.append('items', JSON.stringify(lineas.map(({ precio, ...l }) => l)));
  for (const f of archivos) fd.append('archivo', f, f.name);
  enviando = true; const b = $('enviar'); b.disabled = true; b.textContent = archivos.length ? 'Subiendo archivos…' : 'Enviando…';
  try {
    const r = await fetch('/api/public/pedido', { method: 'POST', body: fd, headers: { 'x-requested-with': 'copias-color' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se pudo enviar. Intenta de nuevo.');
    app.innerHTML = `<div class="card ok"><div class="ck">✓</div><h2>¡Pedido recibido!</h2>
      ${d.orden ? `<p class="muted">Tu número de orden</p><div class="num">N° ${esc(d.orden.numero)}</div><p>Total: <b>${money(d.orden.total)}</b> <span class="muted">(ITBMS incluido)</span></p>` : '<p class="muted">Lo revisamos y te confirmamos el precio y la entrega.</p>'}
      <p class="muted" style="margin-top:14px">Te avisamos cuando esté listo.</p>
      <button class="btn line" style="margin-top:18px" id="otro">Enviar otro pedido</button></div>`;
    document.getElementById('otro').onclick = () => { lineas = []; archivos = []; enviando = false; pintar(); };
  } catch (x) {
    err.textContent = x.message === 'Failed to fetch' ? 'Sin conexión. Revisa el internet e intenta de nuevo.' : x.message;
    b.disabled = false; b.textContent = 'Enviar pedido'; enviando = false;
  }
}

init();
