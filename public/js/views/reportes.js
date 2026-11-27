import { api } from '../api.js';
import { S, today, on } from '../store.js';
import { toast, ICON } from '../ui/dom.js';
import { deslizar } from '../ui/motion.js';
import { exportMenu } from '../ui/pickers.js';
import { exportExcel, printReport } from '../export.js';
import { calGrid } from '../ui/calgrid.js';
import { listPicker } from '../ui/pickers.js';
import { esc, baseNombre, money, money0, int, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, parseD, MESES, MES3, DIAS3, cap, sumDays, emptyDay, METODOS, fechaCorta, dayFromSummary, prodList, fmtCant } from '../util.js';

let root, modo = 'semana', ref = null, data = null, loading = false, reqId = 0, goDia = () => {};
let fProd = null, fCol = 'todos';
const cache = new Map();
const baseItem = it => { const sv = S.settings.catalogo.find(x => x.id === it.tipo); return sv ? baseNombre(sv.nombre) : baseNombre(it.nombre); };
const filtrando = () => !!fProd || fCol !== 'todos';
const pasa = it => (!fProd || baseItem(it) === fProd) && (fCol === 'todos' || (fCol === 'color') === !!it.color);
/** Valores filtrados de un día crudo del resumen */
function filtDia(raw) {
  const o = { monto: 0, cant: 0, color: 0, bn: 0 };
  for (const it of raw?.items || []) { if (!pasa(it)) continue; o.monto += it.monto || 0; o.cant += it.cant || 0; if (it.unidad === 'pág' || it.unidad === 'hoja') { if (it.color) o.color += it.cant; else o.bn += it.cant; } }
  o.total = Math.round(o.monto * (1 + (S.settings.itbms?.tasa ?? 7) / 100));
  return o;
}
export const setGoDia = f => { goDia = f; };

function rango(m = modo, r = ref) {
  if (m === 'semana') { const a = startOfWeek(r); return { from: a, to: addDays(a, 6) }; }
  if (m === 'mes') return { from: startOfMonth(r), to: endOfMonth(r) };
  const y = r.slice(0, 4); return { from: `${y}-01-01`, to: `${y}-12-31` };
}
function mover(n) {
  if (modo === 'semana') ref = addDays(startOfWeek(ref), 7 * n);
  else if (modo === 'mes') ref = addMonths(startOfMonth(ref), n);
  else ref = `${Number(ref.slice(0, 4)) + n}-01-01`;
  load(false, n);
}
function etiqueta() {
  const t = today(), { from, to } = rango();
  const cur = rango(modo, t).from;
  const dF = parseD(from), dT = parseD(to);
  if (modo === 'semana') {
    const sub = dF.getUTCMonth() === dT.getUTCMonth()
      ? `${dF.getUTCDate()} – ${dT.getUTCDate()} ${MES3[dT.getUTCMonth()]} ${dT.getUTCFullYear()}`
      : `${dF.getUTCDate()} ${MES3[dF.getUTCMonth()]} – ${dT.getUTCDate()} ${MES3[dT.getUTCMonth()]} ${dT.getUTCFullYear()}`;
    const main = from === cur ? 'Esta semana' : from === addDays(cur, -7) ? 'Semana pasada' : 'Semana';
    return { main, sub };
  }
  if (modo === 'mes') {
    const nombre = `${cap(MESES[dF.getUTCMonth()])} ${dF.getUTCFullYear()}`;
    const main = from === cur ? 'Este mes' : from === addMonths(cur, -1) ? 'Mes pasado' : nombre;
    return { main, sub: main === nombre ? '' : nombre };
  }
  const y = from.slice(0, 4);
  return { main: from === cur ? 'Este año' : Number(y) === Number(t.slice(0, 4)) - 1 ? 'Año pasado' : y, sub: (from === cur || Number(y) === Number(t.slice(0, 4)) - 1) ? y : '' };
}
function metaPeriodo() {
  const st = S.settings;
  if (modo === 'semana') return { meta: st.dias ? st.meta / st.dias * st.diasSemana : 0, lab: st.diasSemana, barMeta: st.dias ? st.meta / st.dias : 0 };
  if (modo === 'mes') return { meta: st.meta, lab: st.dias, barMeta: st.dias ? st.meta / st.dias : 0 };
  return { meta: st.meta * 12, lab: st.dias * 12, barMeta: st.meta };
}

export function mount(el) {
  root = el;
  ref = today();
  root.innerHTML = `
  <div class="toolbar">
    <div class="seg" data-modo><button data-m="semana">Semana</button><button data-m="mes">Mes</button><button data-m="anio">Año</button></div>
    <button class="iconbtn" data-prev aria-label="Anterior">${ICON.left}</button>
    <button class="datebtn" data-lbl></button>
    <button class="iconbtn" data-next aria-label="Siguiente">${ICON.right}</button>
    <button class="btn ghost sm" data-hoy>Actual</button>
    <div class="spacer"></div>
    <button class="btn line expb" data-exp aria-label="Descargar o imprimir">${ICON.down}<span>Descargar / Imprimir</span></button>
  </div>
  <div class="toolbar filtros"><button type="button" data-fprod></button><button type="button" data-fcol></button></div>
  <div class="lay-rep rep-body">
    <div class="card r-meta">
      <div class="row between" style="align-items:flex-end;flex-wrap:wrap;gap:6px 16px">
        <div><div class="label" data-mlabel>Cobrado</div><div class="big" data-total>$0</div></div>
        <div class="num" style="color:var(--muted);font-weight:600" data-meta></div>
      </div>
      <div class="bar"><i data-bar style="width:0"></i></div>
      <div class="s" data-pct></div>
    </div>
    <div class="kpis" data-kpis></div>
    <div class="card r-cal"><div class="label">Calendario</div><div data-cal></div></div>
    <div class="card r-chart"><div class="label">Ventas por <span data-unit>día</span></div><div class="chart" data-chart></div><div class="axis" data-axis></div></div>
    <div class="card r-met"><div class="label">Por método de pago</div><div data-met></div></div>
    <div class="card r-pag"><div class="label">Productos y servicios</div><div data-pag style="overflow-x:auto"></div></div>
    <div class="card r-tab"><div class="label" data-tlabel>Detalle por día</div><div style="overflow-x:auto"><table class="dtable rtable" data-tab></table></div></div>
  </div>`;
  root.querySelector('[data-modo]').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.m === modo) return;
    const orden = ['semana', 'mes', 'anio'], dir = orden.indexOf(b.dataset.m) > orden.indexOf(modo) ? 1 : -1;
    modo = b.dataset.m; load(false, dir);
  });
  root.querySelector('[data-cal]').addEventListener('click', e => {
    const c = e.target.closest('.cgc[data-k]'); if (!c || c.classList.contains('fuera')) return;
    if (modo === 'anio') { modo = 'mes'; ref = c.dataset.k + '-01'; load(false, 1); } else if (c.dataset.k <= today()) goDia(c.dataset.k);
  });
  listPicker(root.querySelector('[data-fprod]'), {
    items: () => [{ id: '', label: 'Todos los productos' }, ...[...new Set(S.settings.catalogo.filter(x => !x.oculto).map(x => baseNombre(x.nombre)))].map(n => ({ id: n, label: n }))],
    getValue: () => fProd || '', onChange: v => { fProd = v || null; paint(); deslizar(root.querySelector('.rep-body'), 1, 14); },
  });
  listPicker(root.querySelector('[data-fcol]'), {
    items: () => [{ id: 'todos', label: 'Color y B/N' }, { id: 'color', label: 'Solo a color' }, { id: 'bn', label: 'Solo blanco y negro' }],
    getValue: () => fCol, onChange: v => { fCol = v; paint(); deslizar(root.querySelector('.rep-body'), 1, 14); },
  });
  root.querySelector('[data-prev]').onclick = () => mover(-1);
  root.querySelector('[data-next]').onclick = () => mover(1);
  root.querySelector('[data-hoy]').onclick = () => { ref = today(); load(); };
  root.querySelector('[data-lbl]').onclick = () => { ref = today(); load(); };
  root.querySelector('[data-tab]').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return;
    if (modo === 'anio') { modo = 'mes'; ref = tr.dataset.k + '-01'; load(); } else goDia(tr.dataset.k);
  });
  root.querySelector('[data-chart]').addEventListener('click', e => {
    const b = e.target.closest('.b[data-k]'); if (!b) return;
    if (modo === 'anio') { modo = 'mes'; ref = b.dataset.k + '-01'; load(); } else if (b.dataset.k <= today()) goDia(b.dataset.k);
  });
  exportMenu(root.querySelector('[data-exp]'), { onExcel: () => exportar('xls'), onPrint: () => exportar('print') });
  on(what => { if (what === 'remote' || what === 'sale') { cache.clear(); if (root.closest('.view.on')) load(true); } });
}

export function show() {
  load();
  // precargar los otros periodos para que el cambio sea inmediato
  const t = today();
  for (const m of ['semana', 'mes', 'anio']) { const r = rango(m, t), k = `${r.from}|${r.to}`; if (!cache.has(k)) api(`/api/summary?from=${r.from}&to=${r.to}`).then(x => cache.set(k, x), () => {}); }
}

async function load(silent = false, dir = 0) {
  const id = ++reqId, { from, to } = rango(), k = `${from}|${to}`;
  paintHead();
  if (dir) deslizar(root.querySelector('[data-lbl]'), dir);
  const body = root.querySelector('.rep-body');
  if (cache.has(k) && !silent) {
    data = cache.get(k); loading = false; paint();
    if (dir) deslizar(body, dir, 44);
    silent = true;
  } else if (!silent) {
    loading = !data; body.classList.add('cargando'); if (!data) paint();
  }
  try {
    const r = await api(`/api/summary?from=${from}&to=${to}`);
    cache.set(k, r);
    if (id !== reqId) return;
    const habia = body.classList.contains('cargando');
    data = r; loading = false; body.classList.remove('cargando'); paint();
    if (habia && dir) deslizar(body, dir, 44);
  } catch (e) { if (id === reqId) { loading = false; body.classList.remove('cargando'); paint(); if (e.status !== 401) toast(e.message, true); } }
}

function paintHead() {
  root.querySelectorAll('[data-modo] button').forEach(b => b.classList.toggle('sel', b.dataset.m === modo));
  const l = etiqueta();
  root.querySelector('[data-lbl]').innerHTML = `${esc(l.main)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ''}`;
  const cur = rango(modo, today()).from, { from } = rango();
  root.querySelector('[data-next]').disabled = from >= cur;
  root.querySelector('[data-hoy]').classList.toggle('hide', from === cur);
}

const convDays = () => { const o = {}; for (const [k, v] of Object.entries(data?.days || {})) o[k] = dayFromSummary(v); return o; };

function buckets() {
  const { from, to } = rango();
  const days = convDays();
  if (modo === 'anio') {
    const y = from.slice(0, 4);
    return MES3.map((m, i) => {
      const k = `${y}-${String(i + 1).padStart(2, '0')}`;
      const list = Object.keys(days).filter(f => f.startsWith(k)).map(f => days[f]);
      return { k, label: m, s: sumDays(list), days: list.filter(d => d.n > 0).length };
    });
  }
  const out = [];
  for (let f = from; f <= to; f = addDays(f, 1)) out.push({ k: f, label: modo === 'semana' ? DIAS3[parseD(f).getUTCDay()] : String(parseD(f).getUTCDate()), s: days[f] || emptyDay() });
  return out;
}

function paint() {
  const t = today(), { from, to } = rango();
  const actual = from <= t && t <= to;
  const raw = data?.days || {};
  const days = convDays();
  const s = sumDays(Object.values(days));
  const { meta, lab, barMeta } = metaPeriodo();
  const diasV = Object.values(days).filter(d => d.n > 0).length;
  const prom = diasV ? s.cobrado / diasV : 0;
  const fil = filtrando();
  const fd = {}; if (fil) for (const [k, d] of Object.entries(raw)) fd[k] = filtDia(d);
  const fsum = Object.values(fd).reduce((a, x) => ({ monto: a.monto + x.monto, total: a.total + x.total, cant: a.cant + x.cant, color: a.color + x.color, bn: a.bn + x.bn }), { monto: 0, total: 0, cant: 0, color: 0, bn: 0 });
  const valor = k => fil ? (fd[k]?.total || 0) : (days[k]?.cobrado || 0);

  root.querySelector('[data-mlabel]').textContent = fil ? 'Ventas del filtro (con ITBMS)' : 'Cobrado';
  root.querySelector('[data-total]').textContent = money0(fil ? fsum.total : s.cobrado);
  root.querySelector('[data-meta]').textContent = fil ? '' : `Meta ${money0(meta)}`;
  const pct = meta ? s.cobrado / meta * 100 : 0;
  root.querySelector('[data-bar]').parentElement.classList.toggle('hide', fil);
  root.querySelector('[data-bar]').style.width = Math.min(100, pct) + '%';
  root.querySelector('[data-pct]').textContent = fil ? '' : `${pct.toFixed(1)}% de la meta${s.cobrado >= meta && meta ? ' · Meta cumplida' : ''}`;

  const falta = Math.max(0, meta - s.cobrado), rest = Math.max(1, lab - diasV);
  const diasF = Object.values(fd).filter(x => x.cant > 0).length;
  const k = fil ? [
    ['Cantidad', int(fsum.cant), 'páginas, hojas o unidades'],
    ['Monto', money0(fsum.monto), 'sin ITBMS'],
    ['Páginas a color', int(fsum.color), `B/N ${int(fsum.bn)}`],
    ['Días con ventas', int(diasF), diasF ? `promedio ${money0(fsum.total / diasF)}` : ''],
  ] : [
    ['Promedio por día', money0(prom), `${diasV} día${diasV === 1 ? '' : 's'} con ventas`],
    actual ? ['Proyección', money0(prom * lab), `a este ritmo, ${lab} días`] : ['Resultado', money0(s.cobrado), s.cobrado >= meta ? 'meta cumplida' : `faltaron ${money0(meta - s.cobrado)}`],
    ['Páginas a color', int(s.colorPags), `B/N ${int(s.bnPags)}`],
    actual ? ['Faltan por día', falta ? money0(falta / rest) : '$0', falta ? `${rest} días restantes` : 'meta alcanzada'] : ['Ventas', int(s.n), ''],
    ['Por cobrar', money0(s.pendT), `${int(s.pendN)} ${s.pendN === 1 ? 'orden' : 'órdenes'}`],
    ['A crédito', money0(s.credT || 0), `${int(s.credN || 0)} ${s.credN === 1 ? 'orden' : 'órdenes'}`],
  ];
  root.querySelector('[data-kpis]').innerHTML = k.map(([l, v, sub]) => `<div class="kpi"><div class="label" style="margin:0">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('');

  // calendario
  const valCal = kk => {
    if (modo === 'anio') { let v = 0, n = 0; for (const f of Object.keys(raw)) if (f.startsWith(kk)) { v += valor(f); n += fil ? (fd[f]?.cant || 0) : (days[f]?.n || 0); } return { v, n }; }
    return { v: valor(kk), n: fil ? (fd[kk]?.cant || 0) : (days[kk]?.n || 0) };
  };
  root.querySelector('[data-cal]').innerHTML = calGrid({ modo, from, val: valCal, hoy: t });

  // gráfico
  const b = buckets().map(x => ({ ...x, v: modo === 'anio' ? valCal(x.k).v : valor(x.k) }));
  const max = Math.max(fil ? 0 : barMeta, ...b.map(x => x.v), 1);
  root.querySelector('[data-unit]').textContent = modo === 'anio' ? 'mes' : 'día';
  root.querySelector('[data-chart]').innerHTML = b.map(x => `<div class="b${x.v ? '' : ' zero'}${x.k === t || (modo === 'anio' && t.startsWith(x.k)) ? ' today' : ''}" data-k="${x.k}" title="${esc(x.label)}: ${money(x.v)}"><i style="height:${Math.max(1.5, x.v / max * 100)}%"></i></div>`).join('')
    + (barMeta && !fil ? `<div class="goal" style="bottom:${barMeta / max * 100}%"><span>meta ${money0(barMeta)}</span></div>` : '');
  const step = b.length > 20 ? 5 : 1;
  root.querySelector('[data-axis]').innerHTML = b.map((x, i) => `<span>${modo === 'mes' ? ((i + 1) % step === 0 || i === 0 ? x.label : '') : x.label}</span>`).join('');

  const tot = s.cobrado || 1;
  root.querySelector('.r-met').classList.toggle('hide', fil);
  root.querySelector('[data-met]').innerHTML = Object.entries(METODOS).map(([k2, l]) =>
    `<div class="mrow m-${k2}"><span class="dot"></span><span>${l}</span><span class="n">${s.met[k2].n} · ${Math.round(s.met[k2].t / tot * 100)}%</span><span class="a">${money(s.met[k2].t)}</span></div>`).join('');
  let prods = prodList(s);
  if (fil) {
    const m = {};
    for (const d of Object.values(raw)) for (const it of d.items || []) if (pasa(it)) { const l = `${it.nombre} · ${it.tam}`; const q = m[l] ||= { label: l, unidad: it.unidad, cant: 0, monto: 0 }; q.cant += it.cant; q.monto += it.monto; }
    prods = Object.values(m).sort((a, c) => c.monto - a.monto);
  }
  root.querySelector('[data-pag]').innerHTML = prods.length ? `<table class="dtable"><thead><tr><th>Producto o servicio</th><th>Cantidad</th><th>Monto</th></tr></thead><tbody>
    ${prods.map(p => `<tr><td>${esc(p.label)}</td><td class="num">${esc(fmtCant(p.cant, p.unidad))}</td><td class="num">${money(p.monto)}</td></tr>`).join('')}
    <tr class="tot"><td>Total (sin ITBMS)</td><td></td><td class="num">${money(prods.reduce((a2, p) => a2 + p.monto, 0))}</td></tr></tbody></table>` : '<div class="empty">Sin órdenes</div>';
  // tabla
  root.querySelector('[data-tlabel]').textContent = modo === 'anio' ? 'Detalle por mes' : 'Detalle por día';
  const tab = root.querySelector('[data-tab]');
  if (loading) { tab.innerHTML = '<tbody><tr><td class="empty">Cargando…</td></tr></tbody>'; return; }
  if (fil) {
    const rows = b.map(x => ({ x, c: modo === 'anio' ? valCal(x.k).n : (fd[x.k]?.cant || 0) })).filter(r => r.c || r.x.v);
    if (!rows.length) { tab.innerHTML = '<tbody><tr><td class="empty">Sin ventas con este filtro</td></tr></tbody>'; return; }
    tab.innerHTML = `<thead><tr><th>${modo === 'anio' ? 'Mes' : 'Día'}</th><th>Cantidad</th><th>Monto con ITBMS</th></tr></thead><tbody>
      ${rows.slice().reverse().map(({ x, c }) => `<tr data-k="${x.k}"><td>${esc(modo === 'anio' ? cap(MESES[Number(x.k.slice(5, 7)) - 1]) : cap(fechaCorta(x.k)))}</td><td class="num">${int(c)}</td><td class="num"><b>${money(x.v)}</b></td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="num">${int(fsum.cant)}</td><td class="num">${money(fsum.total)}</td></tr></tbody>`;
    return;
  }
  const rows = buckets().filter(x => x.s.n || x.s.cobrado);
  if (!rows.length) { tab.innerHTML = '<tbody><tr><td class="empty">Sin ventas en este periodo</td></tr></tbody>'; return; }
  tab.innerHTML = `<thead><tr><th>${modo === 'anio' ? 'Mes' : 'Día'}</th><th>Órdenes</th><th>Color</th><th class="dk">Efectivo</th><th class="dk">Tarjeta</th><th class="dk">Yappy</th><th>Cobrado</th>${modo === 'anio' ? '<th class="dk">Días</th>' : ''}</tr></thead><tbody>
  ${rows.slice().reverse().map(x => {
    const last = modo === 'anio' ? `<td class="num dk">${x.days}</td>` : '';
    const name = modo === 'anio' ? cap(MESES[Number(x.k.slice(5, 7)) - 1]) : cap(fechaCorta(x.k));
    return `<tr data-k="${x.k}"><td>${esc(name)}</td><td class="num">${int(x.s.n)}</td><td class="num">${int(x.s.colorPags)}</td><td class="num dk">${money(x.s.met.efectivo.t)}</td><td class="num dk">${money(x.s.met.tarjeta.t)}</td><td class="num dk">${money(x.s.met.yappy.t)}</td><td class="num"><b>${money(x.s.cobrado)}</b></td>${last}</tr>`;
  }).join('')}
  <tr class="tot"><td>Total</td><td class="num">${int(s.n)}</td><td class="num">${int(s.colorPags)}</td><td class="num dk">${money(s.met.efectivo.t)}</td><td class="num dk">${money(s.met.tarjeta.t)}</td><td class="num dk">${money(s.met.yappy.t)}</td><td class="num">${money(s.cobrado)}</td>${modo === 'anio' ? '<td class="dk"></td>' : ''}</tr></tbody>`;
}

async function exportar(kind) {
  const { from, to } = rango();
  const l = etiqueta();
  try {
    toast('Preparando…');
    const [r, sm] = await Promise.all([api(`/api/sales?from=${from}&to=${to}`), data ? Promise.resolve(data) : api(`/api/summary?from=${from}&to=${to}`)]);
    const { meta } = metaPeriodo();
    const payload = {
      titulo: modo === 'semana' ? 'Informe semanal' : modo === 'mes' ? 'Informe mensual' : 'Informe anual',
      periodo: modo === 'semana' ? `Semana ${l.sub}` : modo === 'mes' ? (l.sub || l.main) : from.slice(0, 4),
      from, to, multiDay: true, porMes: modo === 'anio',
      sales: r.sales, stats: sumDays(Object.values(sm.days || {}).map(dayFromSummary)), closings: {}, days: Object.fromEntries(Object.entries(sm.days || {}).map(([k, v]) => [k, dayFromSummary(v)])), meta,
      archivo: `Ventas_${from}_a_${to}`,
    };
    if (kind === 'xls') await exportExcel(payload); else printReport(payload);
  } catch (e) { toast(e.message, true); }
}
