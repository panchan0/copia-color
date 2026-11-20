import { api } from '../api.js';
import { S, today, on, syncNow, loadMe } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { readText, parseCSV, guessMap, procesar } from '../csvlog.js';
import { esc, int, addDays, dmy, cap, fechaCorta } from '../util.js';

let root, dias = {}, prev = null;

const AYUDA = {
  versant: `<b>Fiery (Versant 180):</b> en Command WorkStation abre el servidor Fiery → <i>Job Log</i> (Registro de trabajos) → <i>Exportar</i> → guarda el archivo .csv. Agrega antes la columna de páginas a color si no aparece (clic derecho en el encabezado → Agregar). Para no hacerlo a mano: en <i>Configure → Fiery Server → Job Log</i> activa <i>Exportar automáticamente</i> por correo o carpeta compartida.`,
  wc7845: `<b>WorkCentre 7845i:</b> en una computadora de la red escribe la IP de la máquina en el navegador (CentreWare Internet Services) → <i>Propiedades → Contabilidad → Xerox Standard Accounting → Informe y restablecer → Generar informe</i> y descarga el .csv. Ese informe trae totales acumulados: después de descargarlo usa <i>Restablecer</i> para que el siguiente empiece en cero, e impórtalo asignándolo al día. Si tu equipo muestra <i>Trabajos → Historial</i> con opción de exportar, también sirve y trae la fecha de cada trabajo.`,
};

export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="maqs" data-maqs></div>
  <div class="card prev hide" data-prev></div>
  <div class="card"><div class="label">Últimos 31 días</div><div style="overflow-x:auto"><table class="dtable" data-tab></table></div></div>`;
  root.addEventListener('change', onFile);
  root.addEventListener('click', onClick);
  on(what => { if (what === 'remote' && root.closest('.view.on')) load(); });
}

export function show() { paintMaqs(); load(); }

function paintMaqs() {
  root.querySelector('[data-maqs]').innerHTML = S.settings.maquinas.map(m => `<div class="card maq">
    <div class="row between"><div><div class="label" style="margin:0">Máquina</div><div class="maq-n">${esc(m.nombre)}</div></div>
      <label class="btn">${ICON.down}Importar registro<input type="file" accept=".csv,.txt,text/csv" data-maq="${m.id}" multiple hidden></label></div>
    <p class="sub-note ayuda">${AYUDA[m.id] || ''}</p>
    ${m.map ? '<p class="sub-note">Las columnas de esta máquina ya están configuradas.</p>' : ''}
  </div>`).join('');
}

async function load() {
  const t = today(), from = addDays(t, -30);
  try { const r = await api(`/api/summary?from=${from}&to=${t}`); dias = r.days; } catch (e) { if (e.status !== 401) toast(e.message, true); }
  const ms = S.settings.maquinas;
  const fechas = Object.keys(dias).filter(f => Object.keys(dias[f].maq || {}).length).sort().reverse();
  root.querySelector('[data-tab]').innerHTML = fechas.length ? `<thead><tr><th>Día</th>${ms.map(m => `<th>${esc(m.nombre)} · color</th><th>B/N</th>`).join('')}<th></th></tr></thead><tbody>
    ${fechas.map(f => `<tr><td>${esc(cap(fechaCorta(f)))}</td>${ms.map(m => { const x = dias[f].maq[m.id]; return `<td class="num"><b>${x ? int(x.color) : '—'}</b></td><td class="num">${x ? int(x.bn) : '—'}</td>`; }).join('')}
      <td style="text-align:right">${ms.filter(m => dias[f].maq[m.id]).map(m => `<button class="lnk an" data-del="${m.id}" data-f="${f}">Borrar ${esc(m.nombre.split(' ')[0])}</button>`).join('')}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Todavía no hay registros importados</td></tr></tbody>';
}

async function onFile(e) {
  const inp = e.target.closest('input[type=file]'); if (!inp || !inp.files.length) return;
  const maq = S.settings.maquinas.find(m => m.id === inp.dataset.maq);
  try {
    const partes = [];
    for (const f of inp.files) partes.push(parseCSV(await readText(f)));
    const header = partes[0].header;
    const rows = partes.flatMap(p => p.header.join('|') === header.join('|') ? p.rows : p.rows);
    const parsed = { header, rows };
    const guardado = maq.map && maq.map.header === header.join('|') ? maq.map : null;
    prev = { maq, parsed, map: guardado ? { ...guardado } : { ...guessMap(header), multiplicar: false, header: header.join('|') }, nombres: [...inp.files].map(f => f.name).join(', ') };
    if (prev.map.copias < 0) prev.map.multiplicar = false;
    await paintPrev();
  } catch (err) { toast('No se pudo leer el archivo: ' + err.message, true); }
  inp.value = '';
}

async function paintPrev() {
  const box = root.querySelector('[data-prev]');
  const { maq, parsed, map } = prev;
  const opts = sel => `<option value="-1">— ninguna —</option>${parsed.header.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h || 'Columna ' + (i + 1))}</option>`).join('')}`;
  const sinFechaCol = map.fecha < 0;
  const res = await procesar(parsed, map, maq.id, sinFechaCol ? (prev.fechaFija || today()) : null);
  prev.res = res;
  const dias2 = Object.entries(res.porDia).sort();
  box.classList.remove('hide');
  box.innerHTML = `<div class="row between wrap"><div><div class="label" style="margin:0">Revisar importación</div><b>${esc(maq.nombre)}</b> · <span class="muted">${esc(prev.nombres)} · ${int(parsed.rows.length)} filas</span></div>
    <button class="btn ghost sm" data-cancel>Cancelar</button></div>
    <div class="mapgrid">
      <div class="field"><label>Fecha del trabajo</label><select class="input" data-m="fecha">${opts(map.fecha)}</select></div>
      <div class="field"><label>Formato de fecha</label><select class="input" data-m="orden"><option value="auto">Automático</option><option value="dmy"${map.orden === 'dmy' ? ' selected' : ''}>Día/mes/año</option><option value="mdy"${map.orden === 'mdy' ? ' selected' : ''}>Mes/día/año</option></select></div>
      <div class="field"><label>Páginas a color</label><select class="input" data-m="color">${opts(map.color)}</select></div>
      <div class="field"><label>Páginas B/N</label><select class="input" data-m="bn">${opts(map.bn)}</select></div>
      <div class="field"><label>Modo de color (si no hay páginas a color)</label><select class="input" data-m="modo">${opts(map.modo)}</select></div>
      <div class="field"><label>Páginas totales</label><select class="input" data-m="total">${opts(map.total)}</select></div>
      <div class="field"><label>Copias</label><select class="input" data-m="copias">${opts(map.copias)}</select></div>
      <label class="check"><input type="checkbox" data-mult${map.multiplicar ? ' checked' : ''}> Multiplicar páginas por copias</label>
      ${sinFechaCol ? `<div class="field"><label>El archivo no trae fecha: asignar al día</label><input class="input" type="date" data-fija value="${prev.fechaFija || today()}"></div>` : ''}
    </div>
    <table class="dtable" style="margin-top:12px"><thead><tr><th>Día</th><th>Trabajos</th><th>Págs color</th><th>Págs B/N</th></tr></thead><tbody>
    ${dias2.map(([f, d]) => `<tr><td>${dmy(f)}</td><td class="num">${int(d.trabajos)}</td><td class="num"><b>${int(d.color)}</b></td><td class="num">${int(d.bn)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">No se encontraron trabajos con estas columnas. Ajusta las columnas de arriba.</td></tr>'}
    </tbody></table>
    ${res.sinFecha ? `<p class="sub-note">${int(res.sinFecha)} filas sin fecha válida se omitieron.</p>` : ''}
    <p class="sub-note">Los trabajos que ya se importaron antes se ignoran, así que puedes subir el mismo archivo más de una vez sin duplicar.</p>
    <button class="btn" data-save ${res.filas.length ? '' : 'disabled'}>Guardar ${int(res.filas.length)} trabajos</button>`;
  box.querySelectorAll('[data-m]').forEach(s => s.addEventListener('change', () => { map[s.dataset.m] = s.dataset.m === 'orden' ? s.value : Number(s.value); paintPrev(); }));
  box.querySelector('[data-mult]').addEventListener('change', e => { map.multiplicar = e.target.checked; paintPrev(); });
  box.querySelector('[data-fija]')?.addEventListener('change', e => { prev.fechaFija = e.target.value; paintPrev(); });
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onClick(e) {
  if (e.target.closest('[data-cancel]')) { prev = null; root.querySelector('[data-prev]').classList.add('hide'); return; }
  const save = e.target.closest('[data-save]');
  if (save && prev?.res) {
    save.disabled = true;
    let nuevos = 0, rep = 0;
    try {
      const filas = prev.res.filas;
      for (let i = 0; i < filas.length; i += 500) {
        const r = await api('/api/machine-jobs', { method: 'POST', body: { maquina: prev.maq.id, rows: filas.slice(i, i + 500), map: i === 0 ? prev.map : undefined } });
        nuevos += r.nuevos; rep += r.repetidos;
      }
      toast(`${int(nuevos)} trabajos guardados${rep ? ` · ${int(rep)} ya estaban` : ''}`);
      prev = null; root.querySelector('[data-prev]').classList.add('hide');
      await loadMe(); paintMaqs(); syncNow(); load();
    } catch (err) { toast(err.message, true); save.disabled = false; }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = '¿Borrar día?'; setTimeout(() => { del.classList.remove('armed'); }, 4000); return; }
    try { await api(`/api/machine-jobs?maquina=${del.dataset.del}&fecha=${del.dataset.f}`, { method: 'DELETE' }); toast('Registros del día borrados'); syncNow(); load(); }
    catch (err) { toast(err.message, true); }
  }
}
