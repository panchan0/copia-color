/** Menú desplegable anclado a un botón. Solo uno abierto a la vez. */
let current = null;

export function closeMenu() { if (current) current.close(); }

/**
 * openMenu(anchor, { build(el, close), width, onClose })
 * build recibe el contenedor del menú y una función close.
 */
export function openMenu(anchor, { build, width, onClose, align = 'left' }) {
  if (current && current.anchor === anchor) { current.close(); return null; }
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  document.body.appendChild(el);
  anchor.classList.add('open');
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = width === 'anchor' ? r.width : (width || Math.max(r.width, 220));
    el.style.width = Math.min(w, window.innerWidth - 16) + 'px';
    let left = align === 'right' ? r.right - el.offsetWidth : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - el.offsetWidth - 8));
    let top = r.bottom + 6;
    const h = el.offsetHeight;
    const arriba = top + h > window.innerHeight - 8 && r.top - h - 6 > 8;
    if (arriba) top = r.top - h - 6;
    el.style.left = left + 'px'; el.style.top = Math.max(8, top) + 'px';
    el.style.transformOrigin = `${Math.max(0, Math.min(el.offsetWidth, r.left + r.width / 2 - left))}px ${arriba ? '100%' : '0'}`;
    el.classList.toggle('up', arriba);
  };
  const outside = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = e => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  const close = () => {
    if (!el.isConnected || el.classList.contains('out')) return;
    anchor.classList.remove('open');
    if (document.documentElement.classList.contains('calma')) el.remove();
    else { el.classList.add('out'); setTimeout(() => el.remove(), 170); }
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('touchstart', outside, true);
    document.removeEventListener('keydown', key);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', reposition, true);
    if (current && current.el === el) current = null;
    onClose && onClose();
  };
  const reposition = e => { if (!el.contains(e.target)) place(); };
  build(el, close, place);
  place();
  el.querySelectorAll('.it, .none').forEach((it, i) => it.style.setProperty('--i', Math.min(i, 10)));
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('touchstart', outside, true);
  }, 0);
  document.addEventListener('keydown', key);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', reposition, true);
  current = { el, anchor, close };
  return current;
}

/** Navegación con flechas dentro de una lista de .it */
export function keyNav(input, listEl) {
  input.addEventListener('keydown', e => {
    const items = [...listEl.querySelectorAll('.it')];
    if (!items.length) return;
    let i = items.findIndex(x => x.classList.contains('act'));
    if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(items.length - 1, i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(0, i - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); (items[i] || items[0]).click(); return; }
    else return;
    items.forEach(x => x.classList.remove('act'));
    items[i].classList.add('act'); items[i].scrollIntoView({ block: 'nearest' });
  });
}
