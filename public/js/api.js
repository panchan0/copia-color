export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
let onUnauthorized = () => {};
let onNetwork = () => {};
let onBloqueo = () => {};
export const setHandlers = (unauth, net, bloqueo) => { onUnauthorized = unauth; onNetwork = net; if (bloqueo) onBloqueo = bloqueo; };

export async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: { 'x-requested-with': 'copias-color' }, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, opt); }
  catch { onNetwork(false); throw new ApiError(0, 'Sin conexión. Revisa el internet e intenta de nuevo.'); }
  onNetwork(true);
  let data = null;
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    if (r.status === 402) onBloqueo((data && data.error) || '');
    throw new ApiError(r.status, (data && data.error) || (r.status >= 500 ? `El servidor no respondió (código ${r.status}). Intenta de nuevo en un momento.` : `Error ${r.status}`));
  }
  return data;
}
