/* Imágenes de los documentos (logo de órdenes/reportes y sellos), guardadas aparte de los ajustes. */
import { api } from './api.js';

let cache = null;
export async function docAssets() {
  if (cache) return cache;
  try { cache = (await api('/api/assets')).assets || {}; } catch { cache = {}; }
  return cache;
}
export async function guardarAsset(k, data) {
  await api(`/api/assets/${k}`, { method: 'PUT', body: { data } });
  cache = { ...(cache || {}), [k]: data || undefined };
  if (!data) delete cache[k];
}

/**
 * Prepara una imagen: recorta el borde blanco, vuelve transparente el fondo blanco (opcional)
 * y la reduce para que pese poco.
 */
export function prepararImagen(file, { max = 900, transparente = true } = {}) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('No se pudo leer la imagen')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c0 = document.createElement('canvas'); c0.width = img.width; c0.height = img.height;
      const x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(img, 0, 0);
      const d = x0.getImageData(0, 0, c0.width, c0.height), p = d.data;
      let minX = c0.width, minY = c0.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c0.height; y++) for (let x = 0; x < c0.width; x++) {
        const i = (y * c0.width + x) * 4, blanco = p[i] > 238 && p[i + 1] > 238 && p[i + 2] > 238;
        if (p[i + 3] > 20 && !blanco) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        else if (transparente && blanco) p[i + 3] = 0;
      }
      if (maxX < 0) { minX = 0; minY = 0; maxX = c0.width - 1; maxY = c0.height - 1; }
      if (transparente) x0.putImageData(d, 0, 0);
      const w = maxX - minX + 1, h = maxY - minY + 1, k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      x.drawImage(c0, minX, minY, w, h, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/png');
      if (out.length > 380000) {
        const c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height;
        const x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height); x2.drawImage(c, 0, 0);
        out = c2.toDataURL('image/jpeg', 0.85);
      }
      if (out.length > 390000) return ko(new Error('La imagen es muy grande'));
      ok(out);
    };
    img.src = url;
  });
}
