import { api } from '../api.js';

/** Pantalla de inicio de sesión / registro. Llama onDone() al entrar. */
export async function showAuth(el, onDone) {
  let signup = true;
  try { signup = (await api('/api/config')).signup; } catch { /* asumir abierto */ }
  let modo = 'login';
  const render = () => {
    el.innerHTML = `<div class="box">
      <div class="brandbig"><div class="cmyk"><i style="background:var(--c)"></i><i style="background:var(--m)"></i><i style="background:var(--y)"></i><i style="background:var(--ink)"></i></div>Color</div>
      <form class="card" novalidate>
        ${signup ? `<div class="seg" style="margin-bottom:16px"><button type="button" data-m="login" class="${modo === 'login' ? 'sel' : ''}">Iniciar sesión</button><button type="button" data-m="reg" class="${modo === 'reg' ? 'sel' : ''}">Crear cuenta</button></div>` : ''}
        ${modo === 'reg' ? '<div class="field"><label for="fNeg">Nombre del negocio</label><input class="input" id="fNeg" name="business" autocomplete="organization" maxlength="80"></div>' : ''}
        <div class="field"><label for="fEmail">Correo</label><input class="input" id="fEmail" name="email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="field"><label for="fPwd">Contraseña${modo === 'reg' ? ' (mínimo 8)' : ''}</label><input class="input" id="fPwd" name="password" type="password" autocomplete="${modo === 'reg' ? 'new-password' : 'current-password'}"></div>
        <div class="err" data-err></div>
        <button class="btn block" type="submit">${modo === 'reg' ? 'Crear cuenta' : 'Entrar'}</button>
      </form></div>`;
    const form = el.querySelector('form');
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { modo = b.dataset.m; render(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      const err = el.querySelector('[data-err]'); err.textContent = '';
      try {
        await api(modo === 'reg' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: v });
        onDone();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
    setTimeout(() => el.querySelector('input')?.focus(), 30);
  };
  render();
}
