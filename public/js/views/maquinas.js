import { api } from '../api.js';
import { S, today, on, syncNow, emit } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { readText, parseCSV, guessMap, procesar, proponerOrdenes } from '../csvlog.js';
import { esc, int, addDays, dmy, cap, fechaCorta, uuid } from '../util.js';

/*
 * Importación en un toque: se sube el registro y la app
 *  - toma solo impresiones a color que salieron OK (lo demás se descarta),
 *  - guarda el conteo de páginas a color por día,
 *  - crea las órdenes de venta (pendientes de cobro, con la fecha del trabajo),
 *  - nunca duplica: lo ya importado se ignora.
 */
let root, dias = {}, ocupado = false;
const resultado = {};

const AYUDA = {
  versant: 'Command WorkStation → Registro de trabajos → Exportar → guarda el archivo. Luego tócalo aquí.',
  wc7845: 'En el navegador, la IP de la máquina → Propiedades → Contabilidad → Informe → descarga el archivo. Luego tócalo aquí.',
};

export function mount(el) {
  root = el;
  root.innerHTML = `<div class="maqs" data-maqs></div>
  <div class="card"><div class="label">Páginas a color · últimos 31 días</div><div class="scrollx"><table class="dtable mtab" data-tab></table></div></div>`;
  root.addEventListener('change', onFile);
  root.addEventListener('click', onClick);
  on(what => { if (what === 'remote' && root.closest('.ajp:not(.hide)')) load(); });
}

export function show() { load(); }

/** Último día con trabajos importados de una máquina */
const ultimoDia = id => Object.keys(dias).filter(f => dias[f].maq?.[id]).sort().at(-1) || null;
const desdeDefault = id => { const u = ultimoDia(id); return u || addDays(today(), -9); };

function paintMaqs() {
  root.querySelector('[data-maqs]').innerHTML = S.settings.maquinas.map(m => {
    const u = ultimoDia(m.id);
    return `<div class="card maq">
      <div class="row between wrap"><div class="maq-n">${esc(m.nombre)}</div><span class="muted">${u ? `Último: ${dmy(u)}` : 'Sin importar'}</span></div>
      <div class="row wrap improw">
        <div class="field"><label>Importar desde</label><input class="input" type="date" data-desde="${m.id}" value="${desdeDefault(m.id)}" max="${today()}"></div>
        <label class="btn big-imp${ocupado ? ' disabled' : ''}">${ICON.down}${ocupado ? 'Importando…' : 'Importar'}<input type="file" data-maq="${m.id}" hidden ${ocupado ? 'disabled' : ''}></label>
      </div>
      ${AYUDA[m.id] ? `<details class="ayuda"><summary>Cómo exportar el registro</summary><p>${AYUDA[m.id]}</p></details>` : ''}
      <div class="impres" data-res="${m.id}">${resultado[m.id] || ''}</div>
    </div>`;
  }).join('');
}

async function load() {
  const t = today(), from = addDays(t, -60);
  try { dias = (await api(`/api/summary?from=${from}&to=${t}`)).days; } catch (e) { if (e.status !== 401) toast(e.message, true); }
  paintMaqs();
  const ms = S.settings.maquinas;
  const fechas = Object.keys(dias).filter(f => f >= addDays(t, -30) && Object.keys(dias[f].maq || {}).length).sort().reverse();
  root.querySelector('[data-tab]').innerHTML = fechas.length ? `<thead><tr><th>Día</th>${ms.map(m => `<th>${esc(m.nombre.split(' ')[0])}</th>`).join('')}<th></th></tr></thead><tbody>
    ${fechas.map(f => `<tr><td>${esc(cap(fechaCorta(f)))}</td>${ms.map(m => { const x = dias[f].maq[m.id]; return `<td class="num"><b>${x ? int(x.color) : '—'}</b></td>`; }).join('')}
      <td style="text-align:right">${ms.filter(m => dias[f].maq[m.id]).map(m => `<button class="lnk an" data-del="${m.id}" data-f="${f}">Borrar${ms.filter(k => dias[f].maq[k.id]).length > 1 ? ' ' + esc(m.nombre.split(' ')[0]) : ''}</button>`).join('')}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Sin registros</td></tr></tbody>';
}

async function onFile(e) {
  const inp = e.target.closest('input[type=file]'); if (!inp || !inp.files.length || ocupado) return;
  const maq = S.settings.maquinas.find(m => m.id === inp.dataset.maq);
  const desde = root.querySelector(`[data-desde="${maq.id}"]`).value || desdeDefault(maq.id);
  const file = inp.files[0]; inp.value = '';
  ocupado = true; paintMaqs();
  const res = { set innerHTML(h) { resultado[maq.id] = h; } };
  resultado[maq.id] = '';
  try {
    const parsed = parseCSV(await readText(file));
    const map = { ...guessMap(parsed.header), multiplicar: false, soloColor: true, soloOk: true, desde, hasta: today() };
    if (map.color < 0) throw new Error('El archivo no tiene la columna de páginas a color. En Fiery agrega "Nº total de páginas impresas en color" o "Número de pasadas en color" al registro y vuelve a exportar.');
    if (map.fecha < 0) throw new Error('El archivo no tiene la fecha de los trabajos.');

    // 1. Conteo de páginas a color por día
    const conteo = await procesar(parsed, map, maq.id);
    let nuevosJobs = 0;
    for (let i = 0; i < conteo.filas.length; i += 500) {
      const r = await api('/api/machine-jobs', { method: 'POST', body: { maquina: maq.id, rows: conteo.filas.slice(i, i + 500) } });
      nuevosJobs += r.nuevos;
    }

    // 2. Órdenes de venta (sin pruebas internas)
    const grupos = (await proponerOrdenes(parsed, map, S.settings.catalogo)).filter(g => !g.interno);
    let creadas = 0, repetidas = 0, sinPrecio = 0;
    for (const g of grupos) {
      if (g.lineas.some(l => !l.precio_cents)) { sinPrecio++; continue; }
      const r = await api('/api/sales', { method: 'POST', body: {
        id: uuid(), origen: g.origen, ts: g.ts, metodo: null, operador: 'Job Log',
        nota: `Importado de ${maq.nombre}: ${g.titulos.join(', ')}`.slice(0, 300),
        items: g.lineas.map(l => ({ serv: l.serv, tam: l.tam, cant: l.cant, precio_cents: l.precio_cents, extra: l.extra || undefined })),
      } });
      if (r.duplicate) repetidas++; else creadas++;
    }
    const pags = conteo.filas.reduce((a, x) => a + x.color, 0);
    const diasN = Object.keys(conteo.porDia).length;
    res.innerHTML = `<div class="diff ok">Del ${dmy(desde)} al ${dmy(today())}: <b>${int(pags)} páginas a color</b> en ${int(conteo.filas.length)} trabajos OK (${diasN} día${diasN === 1 ? '' : 's'}).<br>
      <b>${creadas} órdenes nuevas</b> creadas como pendientes de cobro${repetidas ? ` · ${repetidas} ya estaban` : ''}${nuevosJobs < conteo.filas.length ? ` · ${int(conteo.filas.length - nuevosJobs)} trabajos ya importados antes` : ''}.
      ${sinPrecio ? `<br>${sinPrecio} orden(es) no se crearon porque falta un precio en Ajustes.` : ''}</div>
`;
    toast(`${creadas} órdenes creadas · ${int(pags)} páginas a color`);
    emit('sale'); syncNow();
  } catch (err) {
    res.innerHTML = `<div class="diff bad">${esc(err.message)}</div>`;
    toast(err.message, true);
  }
  ocupado = false; load();
}

async function onClick(e) {
  const del = e.target.closest('[data-del]');
  if (!del) return;
  if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = '¿Borrar conteo?'; setTimeout(() => del.classList.remove('armed'), 4000); return; }
  try { await api(`/api/machine-jobs?maquina=${del.dataset.del}&fecha=${del.dataset.f}`, { method: 'DELETE' }); toast('Conteo del día borrado'); syncNow(); load(); }
  catch (err) { toast(err.message, true); }
}
