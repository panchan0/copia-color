/* Animaciones de la app: cambio de sección, apertura circular, fechas y selectores. */
const root = document.documentElement;
export const calma = () => root.classList.contains('calma');
const esPC = () => matchMedia('(min-width: 900px)').matches;

let ultimo = null;
document.addEventListener('pointerdown', e => { ultimo = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
const punto = () => (ultimo && Date.now() - ultimo.t < 1500 ? { x: ultimo.x, y: ultimo.y } : { x: innerWidth / 2, y: innerHeight / 3 });
const pila = [];

/**
 * Ejecuta `cambiar` (que actualiza la pantalla) con una transición.
 * tipo: 'adelante' | 'atras' (cambio de sección) · 'abrir' | 'cerrar' (subpantalla) · null (sin animación)
 */
export function transicion(tipo, cambiar) {
  if (!tipo || calma()) { if (tipo === 'abrir') pila.push(punto()); if (tipo === 'cerrar') pila.pop(); cambiar(); return; }
  let p = null;
  if (tipo === 'abrir') { p = punto(); pila.push(p); }
  if (tipo === 'cerrar') p = pila.pop() || { x: innerWidth / 2, y: innerHeight / 3 };
  if (p) {
    const r = Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y));
    const m = document.querySelector('main').getBoundingClientRect();
    const set = (k, v) => root.style.setProperty(k, Math.round(v) + 'px');
    set('--vr', r * 1.05);
    set('--ox', p.x - m.left); set('--oy', p.y - m.top);
    set('--nx', p.x - m.left); set('--ny', p.y - (m.top + scrollY));
  }
  const eje = esPC() ? 'y' : 'x';
  root.dataset.vt = tipo === 'abrir' || tipo === 'cerrar' ? tipo : `${tipo}-${eje}`;
  const fin = () => { delete root.dataset.vt; };
  if (document.startViewTransition) {
    try {
      const vt = document.startViewTransition(cambiar);
      vt.finished.then(fin, fin);
      return;
    } catch { /* sigue sin View Transitions */ }
  }
  cambiar();
  const v = document.querySelector('.view.on');
  if (!v) return fin();
  const k = root.dataset.vt;
  const frames = k === 'abrir'
    ? [{ clipPath: `circle(0 at ${p.x}px ${p.y - v.getBoundingClientRect().top}px)` }, { clipPath: `circle(${root.style.getPropertyValue('--vr')} at ${p.x}px ${p.y - v.getBoundingClientRect().top}px)` }]
    : k === 'cerrar' ? [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }]
    : k.endsWith('-y') ? [{ opacity: 0, transform: `translateY(${tipo === 'adelante' ? 40 : -40}px)` }, { opacity: 1, transform: 'none' }]
    : [{ opacity: 0, transform: `translateX(${tipo === 'adelante' ? 40 : -40}px)` }, { opacity: 1, transform: 'none' }];
  v.animate(frames, { duration: k === 'abrir' ? 420 : 320, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(fin, fin);
}

/** Desliza un elemento al cambiar de fecha (dir -1 izquierda, 1 derecha). */
export function deslizar(el, dir) {
  if (!el || calma() || !el.animate) return;
  el.animate([{ transform: `translateX(${dir * 26}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
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
