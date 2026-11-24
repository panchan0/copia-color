import { api } from '../api.js';
import { ci } from '../icons.js';

const pwdField = (id, name, label, ac) => `<div class="field"><label for="${id}">${label}</label>
  <div class="pwdwrap"><input class="input" id="${id}" name="${name}" type="password" autocomplete="${ac}">
  <button type="button" class="eyebtn" data-eye aria-label="Mostrar contraseña">${ci('eye')}</button></div></div>`;

/** Conecta los botones de mostrar/ocultar contraseña dentro de `el`. */
export function bindEyes(el) {
  el.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => {
    const i = b.previousElementSibling, ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    b.innerHTML = ci(ver ? 'eyeoff' : 'eye');
    b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}
export { pwdField };

/** Pantalla de inicio de sesión / registro / recuperación. Llama onDone() al entrar. */
export async function showAuth(el, onDone) {
  let signup = true;
  try { signup = (await api('/api/config')).signup; } catch { /* asumir abierto */ }
  let modo = 'login', emailPrev = '';
  const render = () => {
    const rec = modo === 'rec';
    el.innerHTML = `<div class="box">
      <div class="brandbig"><div class="cmyk"><i style="background:var(--c)"></i><i style="background:var(--m)"></i><i style="background:var(--y)"></i><i style="background:var(--ink)"></i></div>Color</div>
      <form class="card" novalidate>
        ${rec ? '<div class="authtit">Recuperar contraseña</div>' : signup ? `<div class="seg" style="margin-bottom:16px"><button type="button" data-m="login" class="${modo === 'login' ? 'sel' : ''}">Iniciar sesión</button><button type="button" data-m="reg" class="${modo === 'reg' ? 'sel' : ''}">Crear cuenta</button></div>` : ''}
        ${modo === 'reg' ? '<div class="field"><label for="fNeg">Nombre del negocio</label><input class="input" id="fNeg" name="business" autocomplete="organization" maxlength="80"></div>' : ''}
        <div class="field"><label for="fEmail">Correo</label><input class="input" id="fEmail" name="email" type="email" autocomplete="email" inputmode="email" value="${emailPrev.replace(/"/g, '&quot;')}"></div>
        ${rec ? `<div class="field"><label for="fCode">Código de recuperación</label><input class="input" id="fCode" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"></div>
          ${pwdField('fNueva', 'nueva', 'Contraseña nueva', 'new-password')}`
        : pwdField('fPwd', 'password', `Contraseña${modo === 'reg' ? ' (mínimo 8)' : ''}`, modo === 'reg' ? 'new-password' : 'current-password')}
        <div class="err" data-err></div>
        <button class="btn block" type="submit">${rec ? 'Cambiar contraseña y entrar' : modo === 'reg' ? 'Crear cuenta' : 'Entrar'}</button>
        ${modo === 'login' ? '<button type="button" class="lnk authlnk" data-rec>¿Olvidaste tu contraseña?</button>' : ''}
        ${rec ? `<p class="sub-note">El código se crea en Ajustes → Cuenta y seguridad.</p><button type="button" class="lnk authlnk" data-volver>Volver a iniciar sesión</button>` : ''}
      </form></div>`;
    const form = el.querySelector('form');
    const ir = m => { emailPrev = form.email.value; modo = m; render(); };
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => ir(b.dataset.m));
    el.querySelector('[data-rec]')?.addEventListener('click', () => ir('rec'));
    el.querySelector('[data-volver]')?.addEventListener('click', () => ir('login'));
    bindEyes(el);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      const err = el.querySelector('[data-err]'); err.textContent = '';
      try {
        await api(rec ? '/api/auth/recover' : modo === 'reg' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: v });
        onDone();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
    setTimeout(() => el.querySelector(rec ? '#fCode' : 'input')?.focus(), 30);
  };
  render();
}
