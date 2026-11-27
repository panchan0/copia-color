/* Hoja de orden de trabajo en blanco para llenar a mano: dos por hoja carta, con línea de corte. */
import { S } from './store.js';
import { docAssets } from './assets.js';
import { esc } from './util.js';

const cb = t => `<span class="hb-cb"><i></i>${t}</span>`;

function mitad(e, a) {
  const tasa = S.settings?.itbms?.tasa ?? 7;
  const filas = Array.from({ length: 6 }, () => '<tr><td></td><td></td><td></td><td class="hb-cbc"><i></i><i></i></td><td></td><td></td><td></td></tr>').join('');
  return `<div class="hb-half">
    <div class="hb-h">
      <div class="hb-emp">
        ${a.logo_doc ? `<img src="${esc(a.logo_doc)}" alt="">` : `<b>${esc(e.nombre)}</b>`}
        <div>${[e.tel && `Tel. ${esc(e.tel)}`, e.correo && esc(e.correo)].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="hb-tit">
        <div class="hb-label">ORDEN DE TRABAJO</div>
        <div class="hb-meta"><span>N.º</span><span class="hb-l w1"></span><span>Fecha</span><span class="hb-l w2">&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/</span><span>Hora</span><span class="hb-l w3"></span></div>
      </div>
    </div>
    <table class="hb-g">
      <tr><th>Cliente</th><td colspan="3"></td><th>RUC / DV</th><td></td></tr>
      <tr><th>Celular</th><td></td><th>Correo</th><td colspan="3"></td></tr>
      <tr><th>Entrega</th><td class="hb-ent">&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</td><th>Atendió</th><td></td><td colspan="2" class="hb-ops">${cb('Mostrador')}${cb('WhatsApp')}${cb('Correo')}</td></tr>
    </table>
    <table class="hb-t">
      <thead><tr><th class="q">Cant.</th><th>Producto o servicio</th><th class="tm">Tamaño</th><th class="cl">Color · B/N</th><th class="pp">Papel</th><th class="pr">Precio</th><th class="pr">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="hb-opts">
      <div><b>Acabado</b>${cb('Grapado')}${cb('Engargolado')}${cb('Laminado')}${cb('Corte')}${cb('Doblado')}${cb('Perforado')}</div>
      <div><b>Archivo</b>${cb('USB')}${cb('WhatsApp')}${cb('Correo')}${cb('Original físico')}</div>
    </div>
    <div class="hb-pie">
      <div class="hb-izq">
        <div class="hb-nota"><b>Nota</b></div>
        <div class="hb-pago"><b>Pago</b>${cb('Efectivo')}${cb('Tarjeta')}${cb('Yappy')}${cb('Crédito')}${cb('Pendiente')}</div>
        <div class="hb-fir"><span class="f">Firma del cliente</span><span class="sis">${cb('Pasada al sistema')}<em>N.º</em><span class="hb-l w1"></span></span></div>
      </div>
      <table class="hb-tot">
        <tr><th>Subtotal</th><td></td></tr>
        <tr><th>ITBMS ${tasa}%</th><td></td></tr>
        <tr class="g"><th>Total</th><td></td></tr>
        <tr><th>Abono</th><td></td></tr>
        <tr><th>Saldo</th><td></td></tr>
      </table>
    </div>
  </div>`;
}

export async function imprimirHojaBlanco() {
  const em = S.settings?.empresa || {};
  const e = { nombre: S.account?.business || '', tel: em.telefono, correo: em.correo };
  const a = await docAssets();
  const box = document.getElementById('print');
  box.innerHTML = `<div class="hb">${mitad(e, a)}<div class="hb-corte"><span>✂</span></div>${mitad(e, a)}</div>`;
  setTimeout(() => window.print(), 50);
}
