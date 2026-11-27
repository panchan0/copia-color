/* Asistente que contesta los mensajes de los clientes y arma el pedido con el catálogo. */
import type { Env, Settings } from './types';

export interface Linea { serv: string; tam: string; cant: number; paginas?: number; detalle?: string }
export interface Decision { accion: 'responder' | 'crear_orden' | 'operador'; respuesta: string; items: Linea[]; nombre?: string; resumen?: string }
export interface Msg { autor: 'cliente' | 'ia' | 'operador'; texto: string }

const m$ = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Catálogo en texto, con los ids que el asistente debe usar. */
export function catalogoTexto(st: Settings) {
  const out: string[] = [];
  for (const s of st.catalogo as any[]) {
    if (s.oculto || s.libre) continue;
    for (const t of s.tams as any[]) {
      if (t.oculto) continue;
      const precio = t.tramos
        ? 'según páginas: ' + t.tramos.map((tr: any) => `hasta ${tr.hasta} págs ${m$(tr.precio)}`).join(', ')
        : t.precio ? `${m$(t.precio)} por ${s.unidad}` : 'precio a consultar (lo da el operador)';
      out.push(`- serv="${s.id}" tam="${t.id}" · ${s.nombre} · ${t.nombre} · ${precio}`);
    }
  }
  return out.join('\n');
}

function sistema(st: Settings, negocio: string, extra: string) {
  return `Eres el asistente de ${negocio}, una imprenta y centro de copias en Panamá (tel. ${st.empresa.telefono || '—'}, correo ${st.empresa.correo || '—'}${st.empresa.direccion ? `, ${st.empresa.direccion}` : ''}).
Atiendes los mensajes de los clientes para tomar pedidos rápido y en orden. Escribe en español de Panamá, amable, claro y MUY breve (2 a 4 líneas). Sin emojis de más.

CATÁLOGO (usa exactamente estos serv y tam):
${catalogoTexto(st)}

Los precios no incluyen el ITBMS del ${st.itbms.tasa}%, que se suma al total.

REGLAS:
1. Para registrar un pedido necesitas, por cada producto: cuál es (serv y tam del catálogo), la cantidad y, en encuadernados, las páginas. Si falta algo, pregúntalo todo junto en un solo mensaje.
2. Si el cliente necesita enviar el archivo, pídele que lo mande por este mismo chat o correo.
3. Cuando el pedido esté claro y el cliente lo confirme, usa accion "crear_orden" con los items. No digas el total: el sistema lo agrega solo.
4. Usa accion "operador" si: el producto no está en el catálogo o su precio es "a consultar", piden diseño, cotización especial, descuentos, reclamos, pagos, facturas, o no entiendes. En "respuesta" avisa que un operador le contesta en breve.
5. Si solo preguntan algo (precios, horario, cómo enviar el archivo), usa accion "responder".
6. Nunca inventes precios, productos, horarios ni fechas de entrega.
${extra}
RESPONDE SOLO con un JSON válido, sin texto antes ni después:
{"accion":"responder|crear_orden|operador","respuesta":"mensaje para el cliente","items":[{"serv":"","tam":"","cant":1,"paginas":0,"detalle":""}],"nombre":"nombre del cliente si lo dijo","resumen":"resumen del pedido en una línea"}`;
}

function leerJson(t: string): Decision | null {
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try {
    const d = JSON.parse(t.slice(a, z + 1));
    const accion = ['responder', 'crear_orden', 'operador'].includes(d.accion) ? d.accion : 'operador';
    const respuesta = typeof d.respuesta === 'string' ? d.respuesta.trim().slice(0, 1500) : '';
    if (!respuesta) return null;
    const items = Array.isArray(d.items) ? d.items.slice(0, 20).map((x: any) => ({
      serv: String(x?.serv || ''), tam: String(x?.tam || ''), cant: Number(x?.cant) || 0,
      paginas: Number(x?.paginas) || undefined, detalle: typeof x?.detalle === 'string' ? x.detalle.slice(0, 200) : '',
    })).filter((x: Linea) => x.serv && x.tam && x.cant > 0) : [];
    return { accion, respuesta, items, nombre: typeof d.nombre === 'string' ? d.nombre.slice(0, 80) : '', resumen: typeof d.resumen === 'string' ? d.resumen.slice(0, 200) : '' };
  } catch { return null; }
}

export const iaDisponible = (env: Env) => !!(env.ANTHROPIC_API_KEY || env.AI);

/** Pide la decisión al modelo. Devuelve null si no hay IA o falla (lo atiende un operador). */
export async function pensar(env: Env, st: Settings, negocio: string, hist: Msg[], extra = ''): Promise<Decision | null> {
  const sys = sistema(st, negocio, extra);
  // turnos alternados: cliente = user; IA u operador = assistant
  const turnos: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of hist.slice(-16)) {
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    const content = m.autor === 'operador' ? `(Operador) ${m.texto}` : m.texto;
    if (!content) continue;
    const last = turnos[turnos.length - 1];
    if (last && last.role === role) last.content += '\n' + content; else turnos.push({ role, content });
  }
  while (turnos.length && turnos[0].role !== 'user') turnos.shift();
  if (!turnos.length) return null;
  try {
    if (env.ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 900, system: sys, messages: turnos }),
      });
      if (!r.ok) { console.error('ia', r.status, await r.text()); return null; }
      const d: any = await r.json();
      return leerJson((d.content || []).map((x: any) => x.text || '').join(''));
    }
    if (env.AI) {
      const out: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any, {
        messages: [{ role: 'system', content: sys }, ...turnos], max_tokens: 900, temperature: 0.2,
      } as any);
      const t = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? '');
      return leerJson(t);
    }
  } catch (e) { console.error('ia', e); }
  return null;
}
