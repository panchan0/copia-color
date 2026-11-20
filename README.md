# Color — control de impresiones y copias a color

App web para registrar ventas de impresiones y copias a color (Xerox Versant 180), con cuentas, clientes, cierre del día, reportes por semana, mes y año, y exportación a Excel o impresión.

- **Frontend:** HTML + CSS + JavaScript (módulos ES), sin paso de compilación. Está en `public/`.
- **Backend:** Cloudflare Worker en TypeScript (`src/`).
- **Base de datos:** Cloudflare D1 (SQLite). El esquema está en `migrations/`.
- **Excel:** ExcelJS, incluido en `public/vendor/`.

## Publicar en Cloudflare (una sola vez)

Necesitas una cuenta gratis de Cloudflare y Node.js 20 o superior.

```bash
npm install
npx wrangler login                         # abre el navegador para autorizar
npx wrangler d1 create copias-color-db     # crea la base de datos
```

El último comando muestra un `database_id`. Cópialo en `wrangler.jsonc`, en lugar de `00000000-0000-0000-0000-000000000000`.

```bash
npm run db:migrate:remote                  # crea las tablas
npm run deploy                             # publica la app
```

Wrangler te muestra la dirección de la app, algo como `https://copias-color.TU-SUBDOMINIO.workers.dev`. Ábrela, crea la cuenta del negocio y entra con esa misma cuenta en todos los equipos.

El registro de cuentas nuevas está cerrado (`"ALLOW_SIGNUP": "false"` en `wrangler.jsonc`). Para crear otra cuenta, cámbialo a `"true"`, publica, crea la cuenta y vuelve a cerrarlo.

Las tablas y sus cambios se crean solos al arrancar (`src/schema.ts`); no hace falta ejecutar SQL a mano.

### Dominio propio (opcional)
En el panel de Cloudflare entra a Workers & Pages → copias-color → Settings → Domains & Routes, y agrega tu dominio.

## Actualizar la app
Después de cambiar el código, ejecuta `npm run deploy`. Si agregas una migración nueva en `migrations/`, ejecuta antes `npm run db:migrate:remote`.

## Registros de las máquinas
En la sección **Máquinas** se sube el CSV del Job Log de Fiery (Versant 180) o el informe de la WorkCentre 7845i. La app reconoce las columnas, guarda la configuración por máquina e ignora los trabajos que ya estaban importados.

## Respaldos
- **Automático:** D1 tiene *Time Travel*, que permite restaurar la base a cualquier minuto de los últimos 7 días en el plan gratis, o de los últimos 30 días en el plan Workers Paid de $5 al mes.
  `npx wrangler d1 time-travel restore copias-color-db --timestamp=2026-11-19T20:00:00Z`
- **Manual:** `npm run db:backup` descarga toda la base a `respaldo.sql`. Guarda ese archivo en otro lugar, por ejemplo en Drive. Se recomienda hacerlo una vez por semana.

## Probar en tu computadora
```bash
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

## Estructura
```
src/index.ts        rutas de la API y protección CSRF
src/auth.ts         contraseñas (PBKDF2), sesiones con cookie HttpOnly, límite de intentos
src/routes.ts       cuentas, ajustes, clientes, ventas, resumen y cierres
src/settings.ts     validación de precios, meta y zona horaria
migrations/         tablas de D1 (montos guardados en centavos)
public/js/views/    Día, Caja, Reportes, Ajustes, Login
public/js/ui/       menús desplegables, calendario, diálogos
public/js/export.js Excel (carta vertical, ajustado al ancho de 1 página) e impresión
```

## Seguridad
- Las contraseñas se guardan cifradas con PBKDF2-SHA256 y una sal aleatoria.
- La sesión dura 30 días y se renueva sola. Se guarda en una cookie HttpOnly y SameSite=Lax.
- Hay un límite de intentos de inicio de sesión: 8 cada 15 minutos por correo.
- El servidor recalcula los precios y totales de cada venta; no confía en los que manda el navegador.
- Cada cuenta solo puede ver sus propias ventas, clientes y cierres.
