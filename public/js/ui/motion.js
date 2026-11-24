/* Animaciones de la app: cambio de sección, apertura circular, fechas y selectores. */
const root = document.documentElement;
export const calma = () => root.classList.contains('calma');
const esPC = () => matchMedia('(min-width: 900px)').matches;

let ultimo = null;
document.addEventListener('pointerdown', e => { ultimo = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
const punto = () => (ultimo && Date.now() - ultimo.t < 1500 ? { x: ultimo.x, y: ultimo.y } : { x: innerWidth / 2, y: innerHeight / 3 });
const pila = [];

/**
 * Ejecuta `cambiar` (que muestra otra pantalla) con una transición propia, sin capturas:
 * la pantalla anterior queda fija en su lugar mientras sale y la nueva entra.
 * tipo: 'adelante' | 'atras' (cambio de sección) · 'abrir' | 'cerrar' (subpantalla) · null
 */
let enCurso = null;
export function transicion(tipo, cambiar, getEl = () => document.querySelector('.view.on')) {
  if (enCurso) enCurso();
  if (tipo === 'abrir') pila.push(punto());
  const pOrigen = tipo === 'cerrar' ? (pila.pop() || { x: innerWidth / 2, y: innerHeight / 3 }) : tipo === 'abrir' ? pila[pila.length - 1] : null;
  const viejo = getEl();
  if (!tipo || calma() || !viejo || !viejo.animate) { cambiar(); return; }
  const r = viejo.getBoundingClientRect();
  // congelar la pantalla anterior donde está
  const fantasma = viejo;
  fantasma.classList.add('saliendo');
  Object.assign(fantasma.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', margin: '0', pointerEvents: 'none', zIndex: tipo === 'cerrar' ? '6' : '1' });
  cambiar();
  const nuevo = getEl();
  if (!nuevo || nuevo === viejo) { limpiar(); return; }
  nuevo.style.position = 'relative'; nuevo.style.zIndex = tipo === 'cerrar' ? '0' : '5';
  const pc = esPC(), sgn = tipo === 'atras' ? -1 : 1;
  const ease = 'cubic-bezier(.22,.8,.24,1)';
  let a1, a2;
  if (tipo === 'adelante' || tipo === 'atras') {
    const d = pc ? 'translateY' : 'translateX', far = pc ? 48 : Math.round(innerWidth * 0.32), near = pc ? -32 : -Math.round(innerWidth * 0.18);
    a1 = fantasma.animate([{ transform: 'none', opacity: 1 }, { transform: `${d}(${near * sgn}px)`, opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    a2 = nuevo.animate([{ transform: `${d}(${far * sgn}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: ease, fill: 'backwards' });
  } else {
    const p = pOrigen, R = Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y)) + 40;
    if (tipo === 'abrir') {
      const nr = nuevo.getBoundingClientRect(), x = p.x - nr.left, y = p.y - nr.top;
      nuevo.classList.add('revelando');
      a2 = nuevo.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 520, easing: 'cubic-bezier(.33,.7,.2,1)' });
      a1 = fantasma.animate([{ opacity: 1, transform: 'none' }, { opacity: 0.6, transform: 'scale(.985)' }], { duration: 520, easing: ease, fill: 'forwards' });
    } else {
      const x = p.x - r.left, y = p.y - r.top;
      fantasma.classList.add('revelando');
      a1 = fantasma.animate([{ clipPath: `circle(${R}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }], { duration: 440, easing: 'cubic-bezier(.55,0,.7,.35)', fill: 'forwards' });
      a2 = nuevo.animate([{ opacity: 0.6, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 440, easing: ease });
    }
  }
  function limpiar() {
    enCurso = null;
    fantasma.classList.remove('saliendo', 'revelando');
    fantasma.removeAttribute('style');
    if (nuevo) { nuevo.classList.remove('revelando'); nuevo.style.position = ''; nuevo.style.zIndex = ''; }
    a1?.cancel(); a2?.cancel();
  }
  enCurso = limpiar;
  Promise.all([a1?.finished, a2?.finished].filter(Boolean)).then(limpiar, limpiar);
}

/** Desliza un elemento al cambiar de fecha (dir -1 izquierda, 1 derecha). */
export function deslizar(el, dir, dist = 36) {
  if (!el || calma() || !el.animate) return;
  el.animate([{ transform: `translateX(${dir * dist}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.22,.9,.28,1.06)' });
}

/* Indicadores deslizantes: menú principal y selectores (.seg). */
function moverInd(cont, sel, ind, instant) {
  if (!sel) { ind.style.opacity = '0'; return; }
  const a = sel.getBoundingClientRect(), b = cont.getBoundingClientRect();
  if (!a.width) return;
  ind.style.transition = instant ? 'none' : '';
  ind.style.opacity = '1';
  ind.style.width = a.width + 'px'; ind.style.height = a.height + 'px';
  ind.style.transform = `translate(${a.left - b.left + cont.scrollLeft}px, ${a.top - b.top + cont.scrollTop}px)`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
}
function ind(cont, cls) {
  let i = cont.querySelector(':scope > .' + cls);
  if (!i) { i = document.createElement('span'); i.className = cls; i.setAttribute('aria-hidden', 'true'); cont.prepend(i); i._nuevo = true; }
  return i;
}
export function syncSeg(seg) {
  const i = ind(seg, 'segind');
  moverInd(seg, seg.querySelector(':scope > button.sel'), i, i._nuevo || !seg.offsetParent); i._nuevo = false;
}
export function syncNav() {
  const nav = document.querySelector('nav.tabs .in'); if (!nav) return;
  const i = ind(nav, 'navind');
  moverInd(nav, [...nav.querySelectorAll('button.on')].find(b => b.offsetWidth), i, i._nuevo); i._nuevo = false;
}
const pend = new Set(); let raf = 0;
const programar = s => { pend.add(s); if (!raf) raf = requestAnimationFrame(() => { raf = 0; pend.forEach(syncSeg); pend.clear(); }); };
new MutationObserver(ms => {
  for (const m of ms) {
    if (m.type === 'attributes') { const t = m.target; if (t.parentElement?.classList.contains('seg')) programar(t.parentElement); }
    else m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.classList.contains('seg')) programar(n); n.querySelectorAll?.('.seg').forEach(programar); });
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
const todo = () => { document.querySelectorAll('.seg').forEach(s => { const i = s.querySelector(':scope > .segind'); if (i) moverInd(s, s.querySelector(':scope > button.sel'), i, true); }); if (document.querySelector('nav.tabs .in .navind')) { const n = document.querySelector('nav.tabs .in .navind'); moverInd(n.parentElement, [...n.parentElement.querySelectorAll('button.on')].find(b => b.offsetWidth), n, true); } };
addEventListener('resize', todo);
document.addEventListener('vista-visible', () => requestAnimationFrame(todo));
