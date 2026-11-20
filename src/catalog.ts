/**
 * Catálogo de productos y servicios.
 * La estructura (servicios y tamaños) vive aquí; los precios que el negocio
 * cambia en Ajustes se guardan por id y se combinan con esta estructura.
 * Precios en centavos. precio 0 = "precio libre" (se escribe al cobrar).
 */
export type Cat = 'color' | 'bn' | 'planos' | 'enc' | 'otros';
export type Unidad = 'pág' | 'hoja' | 'pie lineal' | 'juego' | 'unidad';
export interface Tramo { hasta: number; precio: number }
export interface Tam { id: string; nombre: string; precio: number; pl?: number; tramos?: Tramo[] }
export interface Servicio { id: string; cat: Cat; nombre: string; color: boolean; unidad: Unidad; tams: Tam[]; libre?: boolean }

export const CATEGORIAS: Record<Cat, string> = {
  color: 'Color', bn: 'Blanco y negro', planos: 'Planos', enc: 'Encuadernación', otros: 'Otros',
};

const T = (id: string, nombre: string, precio: number, pl?: number): Tam => (pl ? { id, nombre, precio, pl } : { id, nombre, precio });
const PLANOS: [string, string, number][] = [
  ['18x24', '18 x 24 (1.5 pies lineales)', 1.5], ['24x36', '24 x 36 (2 pies lineales)', 2], ['30x36', '30 x 36 (2.5 pies lineales)', 2.5],
  ['36x36', '36 x 36 (3 pies lineales)', 3], ['30x42', '30 x 42 (3.5 pies lineales)', 3.5], ['36x48', '36 x 48 (4 pies lineales)', 4],
];
const plano = (precios: number[]) => PLANOS.map(([id, n, pl], i) => T(id, n, precios[i], pl));
const tramos = (precios: number[]) => precios.map((p, i) => ({ hasta: (i + 1) * 50, precio: p }));

export const DEFAULT_CATALOGO: Servicio[] = [
  // ---- Color ----
  { id: 'col_imp', cat: 'color', nombre: 'Impresión a color', color: true, unidad: 'pág', tams: [T('carta', 'Carta 8.5 x 11', 80), T('legal', 'Legal 8.5 x 14', 110), T('tab', 'Tabloide 11 x 17', 225)] },
  { id: 'col_cop', cat: 'color', nombre: 'Copia a color', color: true, unidad: 'pág', tams: [T('carta', 'Carta 8.5 x 11', 60), T('legal', 'Legal 8.5 x 14', 90), T('tab', 'Tabloide 11 x 17', 170)] },
  { id: 'col_cart', cat: 'color', nombre: 'Impresión a color en cartoncillo', color: true, unidad: 'hoja', tams: [T('carta', 'Carta 8.5 x 11', 90)] },
  { id: 'col_cart_rep', cat: 'color', nombre: 'Cartoncillo repetitivo (misma imagen en la hoja)', color: true, unidad: 'hoja', tams: [T('carta', 'Carta 8.5 x 11', 90)] },
  // ---- Blanco y negro ----
  { id: 'bn_imp', cat: 'bn', nombre: 'Impresión blanco y negro', color: false, unidad: 'pág', tams: [T('carta', 'Carta 8.5 x 11', 0), T('legal', 'Legal 8.5 x 14', 0), T('tab', 'Tabloide 11 x 17', 70)] },
  { id: 'bn_cop', cat: 'bn', nombre: 'Copia blanco y negro', color: false, unidad: 'pág', tams: [T('carta', 'Carta 8.5 x 11', 0), T('legal', 'Legal 8.5 x 14', 0), T('tab', 'Tabloide 11 x 17', 30)] },
  // ---- Planos (blanco y negro) ----
  { id: 'pl_cop_bond', cat: 'planos', nombre: 'Copia de plano B/N · papel bond', color: false, unidad: 'hoja', tams: plano([83, 110, 138, 165, 193, 220]) },
  { id: 'pl_cop_alb', cat: 'planos', nombre: 'Copia de plano B/N · papel albanene', color: false, unidad: 'hoja', tams: plano([270, 360, 450, 540, 630, 720]) },
  { id: 'pl_imp_bond', cat: 'planos', nombre: 'Impresión de plano B/N · papel bond', color: false, unidad: 'hoja', tams: plano([236, 314, 393, 471, 550, 628]) },
  { id: 'pl_imp_alb', cat: 'planos', nombre: 'Impresión de plano B/N · papel albanene', color: false, unidad: 'hoja', tams: plano([338, 450, 563, 675, 788, 900]) },
  { id: 'pl_esc', cat: 'planos', nombre: 'Escaneo de plano', color: false, unidad: 'hoja', tams: plano([105, 140, 175, 210, 245, 280]) },
  { id: 'pl_amp', cat: 'planos', nombre: 'Ampliación / reducción de plano B/N', color: false, unidad: 'pie lineal', tams: [T('pl', 'Según tamaño (por pie lineal)', 175)] },
  // ---- Encuadernación (precio según páginas) ----
  { id: 'enc_cart', cat: 'enc', nombre: 'Encuadernado con cartoncillo', color: false, unidad: 'juego', tams: [
    { id: 'carta', nombre: 'Carta 8.5 x 11', precio: 0, tramos: tramos([200, 225, 250, 275, 300, 325, 350]) },
    { id: 'legal', nombre: 'Legal 8.5 x 14', precio: 0, tramos: tramos([225, 250, 275, 300, 325, 350, 375]) },
    { id: 'tab', nombre: 'Tabloide 11 x 17', precio: 0, tramos: tramos([300, 350, 400, 450, 500, 550, 600]) },
  ] },
  { id: 'enc_vin', cat: 'enc', nombre: 'Encuadernado con vinílica', color: false, unidad: 'juego', tams: [
    { id: 'carta', nombre: 'Carta 8.5 x 11', precio: 0, tramos: tramos([225, 250, 275, 300, 325, 350, 375]) },
    { id: 'tab', nombre: 'Tabloide 11 x 17', precio: 0, tramos: tramos([450, 500, 550, 600, 650, 700, 750]) },
  ] },
  { id: 'enc_rab', cat: 'enc', nombre: 'Encuadernado rabito', color: false, unidad: 'juego', tams: [
    { id: 'carta', nombre: 'Carta 8.5 x 11', precio: 0, tramos: tramos([250, 275, 300, 325, 350, 375, 400]) },
  ] },
  { id: 'enc_dob', cat: 'enc', nombre: 'Encuadernado doble O', color: false, unidad: 'juego', tams: [
    { id: 'carta', nombre: 'Carta 8.5 x 11', precio: 0, tramos: tramos([275, 300, 325, 350, 375, 400, 425]) },
  ] },
  // ---- Otros ----
  { id: 'otro', cat: 'otros', nombre: 'Otro producto o servicio', color: false, unidad: 'unidad', libre: true, tams: [T('libre', 'Descripción libre', 0)] },
];

const cents = (v: unknown, max = 1_000_000) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };

const CATS = new Set(['color', 'bn', 'planos', 'enc', 'otros']);
const UNIDADES = new Set(['pág', 'hoja', 'pie lineal', 'juego', 'unidad']);
const ID_USER = /^u_[a-z0-9_]{1,40}$/;
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function tamUsuario(tv: any): Tam | null {
  if (!tv || !ID_USER.test(tv.id)) return null;
  const nombre = txt(tv.nombre, 60); const p = cents(tv.precio);
  if (!nombre || p == null) return null;
  return { id: tv.id, nombre, precio: p, ...(tv.oculto ? { oculto: true } : {}) } as Tam;
}

/**
 * Combina la estructura del código con lo guardado:
 * precios de los productos del sistema, tamaños agregados a ellos y productos nuevos (ids "u_…").
 * Un producto o tamaño marcado "oculto" no se muestra al cobrar.
 */
export function mergeCatalogo(saved: unknown): Servicio[] {
  const cat: Servicio[] = structuredClone(DEFAULT_CATALOGO);
  if (!Array.isArray(saved)) return cat;
  const byId = new Map<string, any>(saved.filter((s: any) => s && typeof s.id === 'string').map((s: any) => [s.id, s]));
  for (const s of cat) {
    const sv = byId.get(s.id); if (!sv || !Array.isArray(sv.tams)) continue;
    for (const t of s.tams) {
      const tv = sv.tams.find((x: any) => x && x.id === t.id); if (!tv) continue;
      const p = cents(tv.precio); if (p != null) t.precio = p;
      if (t.tramos && Array.isArray(tv.tramos)) t.tramos.forEach((tr, i) => { const q = cents(tv.tramos[i]?.precio); if (q != null) tr.precio = q; });
      if (tv.oculto) (t as any).oculto = true;
    }
    if (!s.tams.some(t => t.tramos)) for (const tv of sv.tams.slice(0, 40)) { const t = tamUsuario(tv); if (t && !s.tams.some(x => x.id === t.id)) s.tams.push(t); }
    if (sv.oculto) (s as any).oculto = true;
  }
  for (const sv of saved.slice(0, 200) as any[]) {
    if (!sv || !ID_USER.test(sv.id) || cat.some(x => x.id === sv.id)) continue;
    const nombre = txt(sv.nombre, 80);
    if (!nombre || !CATS.has(sv.cat)) continue;
    const tams = (Array.isArray(sv.tams) ? sv.tams : []).slice(0, 40).map(tamUsuario).filter(Boolean) as Tam[];
    if (!tams.length) continue;
    cat.push({ id: sv.id, cat: sv.cat, nombre, color: !!sv.color, unidad: UNIDADES.has(sv.unidad) ? sv.unidad : 'unidad', tams, ...(sv.oculto ? { oculto: true } : {}) } as Servicio);
  }
  return cat;
}

export function findItem(cat: Servicio[], servId: string, tamId: string) {
  const s = cat.find(x => x.id === servId); if (!s) return null;
  const t = s.tams.find(x => x.id === tamId); if (!t) return null;
  return { s, t };
}

/** Precio de encuadernación según páginas. null si excede los tramos. */
export function precioTramo(t: Tam, paginas: number): { precio: number; desde: number; hasta: number } | null {
  if (!t.tramos) return null;
  let desde = 1;
  for (const tr of t.tramos) { if (paginas <= tr.hasta) return { precio: tr.precio, desde, hasta: tr.hasta }; desde = tr.hasta + 1; }
  return null;
}
