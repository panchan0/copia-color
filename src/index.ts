import type { Ctx, Env } from './types';
import { HttpError, json } from './http';
import { requireAccount } from './auth';
import * as R from './routes';
import { ensureSchema } from './schema';

type Handler = (c: Ctx) => Promise<Response>;
const routes: [string, RegExp, Handler][] = [];
const add = (m: string, p: string, h: Handler) =>
  routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h]);

add('GET', '/api/me', R.me);
add('GET', '/api/rev', R.rev);
add('PUT', '/api/account', R.updateAccount);
add('POST', '/api/account/password', R.changePassword);
add('POST', '/api/auth/logout-all', R.logoutAll);
add('PUT', '/api/settings', R.putSettings);
add('GET', '/api/clients', R.listClients);
add('POST', '/api/clients', R.createClient);
add('PUT', '/api/clients/:id', R.updateClient);
add('DELETE', '/api/clients/:id', R.deleteClient);
add('GET', '/api/sales', R.listSales);
add('POST', '/api/sales', R.createSale);
add('POST', '/api/sales/:id/void', R.voidSale);
add('POST', '/api/sales/:id/pay', R.paySale);
add('POST', '/api/sales/:id/metodo', R.setMetodo);
add('POST', '/api/sales/pay-many', R.payMany);
add('GET', '/api/orders', R.listOrders);
add('POST', '/api/machine-jobs', R.importJobs);
add('DELETE', '/api/machine-jobs', R.deleteJobsDay);
add('GET', '/api/sales/:id', R.saleById);
add('GET', '/api/summary', R.summary);
add('GET', '/api/closings/:fecha', R.getClosing);
add('PUT', '/api/closings/:fecha', R.putClosing);

function checkCsrf(req: Request, url: URL) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers.get('x-requested-with') !== 'copias-color') throw new HttpError(403, 'Solicitud no permitida');
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'Origen no permitido');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      checkCsrf(req, url);
      // Si la actualización de tablas falla, se registra y la app sigue funcionando
      try { await ensureSchema(env); } catch (e) { console.error('ensureSchema', e); }
      const p = url.pathname, m = req.method;
      if (p === '/api/auth/register' && m === 'POST') return await R.register(env, req, url);
      if (p === '/api/auth/login' && m === 'POST') return await R.login(env, req, url);
      if (p === '/api/auth/logout' && m === 'POST') return await R.logout(env, req, url);
      if (p === '/api/config' && m === 'GET') return json({ signup: (env.ALLOW_SIGNUP || 'true') === 'true', version: env.CF_VERSION_METADATA?.id || 'dev' });
      for (const [method, re, h] of routes) {
        const match = re.exec(p);
        if (match && method === m) {
          const accountId = await requireAccount(env, req);
          const params: Record<string, string> = {};
          for (const [k, v] of Object.entries(match.groups || {})) params[k] = decodeURIComponent(v);
          return await h({ env, req, url, accountId, params });
        }
      }
      throw new HttpError(404, 'No encontrado');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      const detalle = e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
      return json({ error: `Error del servidor: ${detalle}` }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
