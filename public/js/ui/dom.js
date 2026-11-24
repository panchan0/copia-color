import { ci } from '../icons.js';
import { esc } from '../util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let tt;
export function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', err); t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), err ? 4200 : 2400);
}

export const ICON = {
  left: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  cal: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  down: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  print: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
  sheet: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
  user: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

/** Diálogo modal. fields: [{name,label,type,value,placeholder,required}] → resuelve con los valores o null */
/** Cierra un diálogo con animación. */
export function cerrarOverlay(ov) {
  if (document.documentElement.classList.contains('calma')) return ov.remove();
  ov.classList.add('closing'); setTimeout(() => ov.remove(), 220);
}

export function dialog({ title, fields = [], html = '', ok = 'Guardar', cancel = 'Cancelar', danger = false, onSubmit }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<form class="dialog" novalidate>
      <h3>${esc(title)}</h3>${html}
      ${fields.map((f, i) => f.type === 'checkbox'
        ? `<label class="check" style="margin-bottom:10px"><input type="checkbox" id="dlg${i}" name="${f.name}" value="1" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`
        : f.type === 'select'
        ? `<div class="field" style="margin-bottom:10px"><label for="dlg${i}">${esc(f.label)}</label><select class="input" id="dlg${i}" name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}"${v === f.value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`
        : `<div class="field" style="margin-bottom:10px"><label for="dlg${i}">${esc(f.label)}</label>
        ${f.type === 'password' ? '<div class="pwdwrap">' : ''}<input class="input" id="dlg${i}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>${f.type === 'password' ? `<button type="button" class="eyebtn" data-eye aria-label="Mostrar contraseña">${ci('eye')}</button></div>` : ''}</div>`).join('')}
      <div class="err" style="color:var(--bad);font-size:14px;font-weight:600;min-height:18px"></div>
      <div class="acts">${cancel ? `<button type="button" class="btn line" data-x>${esc(cancel)}</button>` : ''}<button class="btn ${danger ? 'danger' : ''}" type="submit">${esc(ok)}</button></div>
    </form>`;
    const form = ov.firstElementChild;
    form.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = b.previousElementSibling, ver = i.type === 'password'; i.type = ver ? 'text' : 'password'; b.innerHTML = ci(ver ? 'eyeoff' : 'eye'); });
    const close = v => { cerrarOverlay(ov); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', key);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    form.querySelector('[data-x]')?.addEventListener('click', () => close(null));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const vals = Object.fromEntries(new FormData(form).entries());
      if (!onSubmit) return close(vals);
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { const r = await onSubmit(vals); close(r ?? vals); }
      catch (err) { form.querySelector('.err').textContent = err.message || 'Error'; btn.disabled = false; }
    });
    document.body.appendChild(ov);
    setTimeout(() => form.querySelector('input')?.focus(), 30);
  });
}

/** Diálogo con botones propios. buttons: [{label, value, cls}] → resuelve con value o null */
export function choice({ title, html = '', buttons }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dialog" role="dialog"><h3>${esc(title)}</h3>${html}<div class="acts wrap">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    const close = v => { cerrarOverlay(ov); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', key);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    ov.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = buttons[Number(b.dataset.i)]; if (x.keep) x.onClick?.(); else close(x.value); });
    document.body.appendChild(ov);
    ov.querySelector('.btn:last-child')?.focus();
  });
}
