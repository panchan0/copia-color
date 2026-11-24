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
  const reset = location.hash.startsWith('#reset=') ? location.hash.slice(7) : null;
  let modo = reset ? 'reset' : 'login', emailPrev = '', pedir2fa = false, guardado = {}, aviso = '';
  const render = () => {
    const titulo = { rec: 'Recuperar contraseña', codigo: 'Usar código de recuperación', reset: 'Nueva contraseña' }[modo];
    let campos = '';
    if (modo === 'login' || modo === 'reg') {
      campos = `${modo === 'reg' ? '<div class="field"><label for="fNeg">Nombre del negocio</label><input class="input" id="fNeg" name="business" autocomplete="organization" maxlength="80"></div>' : ''}
        <div class="field"><label for="fEmail">Correo</label><input class="input" id="fEmail" name="email" type="email" autocomplete="email" inputmode="email" value="${emailPrev.replace(/"/g, '&quot;')}"></div>
        ${pwdField('fPwd', 'password', `Contraseña${modo === 'reg' ? ' (mínimo 8)' : ''}`, modo === 'reg' ? 'new-password' : 'current-password')}
        ${pedir2fa ? '<div class="field"><label for="f2fa">Código de verificación</label><input class="input num code6" id="f2fa" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>' : ''}`;
    } else if (modo === 'rec') {
      campos = `<div class="field"><label for="fEmail">Correo de tu cuenta</label><input class="input" id="fEmail" name="email" type="email" autocomplete="email" inputmode="email" value="${emailPrev.replace(/"/g, '&quot;')}"></div>`;
    } else if (modo === 'codigo') {
      campos = `<div class="field"><label for="fEmail">Correo</label><input class="input" id="fEmail" name="email" type="email" autocomplete="email" value="${emailPrev.replace(/"/g, '&quot;')}"></div>
        <div class="field"><label for="fCode">Código de recuperación</label><input class="input" id="fCode" name="code" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"></div>
        ${pwdField('fNueva', 'nueva', 'Contraseña nueva', 'new-password')}`;
    } else {
      campos = `${pwdField('fNueva', 'nueva', 'Contraseña nueva (mínimo 8)', 'new-password')}
        ${pedir2fa ? '<div class="field"><label for="f2fa">Código de verificación</label><input class="input num code6" id="f2fa" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>' : ''}`;
    }
    const boton = { login: 'Entrar', reg: 'Crear cuenta', rec: 'Enviar enlace', codigo: 'Cambiar contraseña y entrar', reset: 'Guardar y entrar' }[modo];
    el.innerHTML = `<div class="box">
      <div class="brandbig"><div class="cmyk"><i style="background:var(--c)"></i><i style="background:var(--m)"></i><i style="background:var(--y)"></i><i style="background:var(--ink)"></i></div>Color</div>
      <form class="card" novalidate>
        ${titulo ? `<div class="authtit">${titulo}</div>` : signup ? `<div class="seg" style="margin-bottom:16px"><button type="button" data-m="login" class="${modo === 'login' ? 'sel' : ''}">Iniciar sesión</button><button type="button" data-m="reg" class="${modo === 'reg' ? 'sel' : ''}">Crear cuenta</button></div>` : ''}
        ${aviso ? `<div class="okmsg">${aviso}</div>` : ''}
        ${campos}
        <div class="err" data-err></div>
        <button class="btn block" type="submit">${boton}</button>
        ${modo === 'login' ? '<button type="button" class="lnk authlnk" data-ir="rec">¿Olvidaste tu contraseña?</button>' : ''}
        ${modo === 'rec' ? '<button type="button" class="lnk authlnk" data-ir="codigo">Tengo un código de recuperación</button>' : ''}
        ${modo !== 'login' && modo !== 'reg' ? '<button type="button" class="lnk authlnk" data-ir="login">Volver a iniciar sesión</button>' : ''}
      </form></div>`;
    const form = el.querySelector('form');
    const ir = m => { emailPrev = form.email?.value || emailPrev; modo = m; pedir2fa = false; aviso = ''; if (m === 'login' && reset) history.replaceState(null, '', '#'); render(); };
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => ir(b.dataset.m));
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(b.dataset.ir));
    bindEyes(el);
    // conservar lo escrito al pedir el código de verificación
    for (const [k, v] of Object.entries(guardado)) if (form[k] && !form[k].value) form[k].value = v;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      const err = el.querySelector('[data-err]'); err.textContent = '';
      try {
        if (modo === 'rec') {
          await api('/api/auth/forgot', { method: 'POST', body: { email: v.email } });
          emailPrev = v.email; aviso = 'Si el correo tiene una cuenta, te llegará un enlace para cambiar la contraseña. Revisa también el correo no deseado.';
          render(); return;
        }
        const url = { login: '/api/auth/login', reg: '/api/auth/register', codigo: '/api/auth/recover', reset: '/api/auth/reset' }[modo];
        const body = modo === 'reset' ? { token: reset, nueva: v.nueva, code: v.code } : v;
        const r = await api(url, { method: 'POST', body });
        if (r?.need2fa) { guardado = v; pedir2fa = true; render(); setTimeout(() => el.querySelector('#f2fa')?.focus(), 30); return; }
        onDone();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
    setTimeout(() => el.querySelector(pedir2fa ? '#f2fa' : modo === 'codigo' ? '#fCode' : 'input')?.focus(), 30);
  };
  render();
}
