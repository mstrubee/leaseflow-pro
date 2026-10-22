# Traer las láminas de Geochile al Informe Directorio

Extiende la integración con geochile-compass que ya existe en este repo
(`src/lib/geochile/client.ts`, configurada en Admin > Integraciones) para traer
2 láminas PNG por isócrona e insertarlas en el PPT del Informe Directorio.

## Endpoint

`POST {baseUrl}/functions/v1/export-report-slides`

Ojo con la URL: `callGeochileFunction` ya concatena `/functions/v1`, así que el
`base_url` guardado en `geochile_integration_settings` es solo el origen
(`https://fmynxmxrtponfuqxmjli.supabase.co`). Reusa ese helper, no armes la URL
a mano.

Auth: header `x-api-key` con la API key de la integración. NO lleva
`Authorization` ni `apikey` — las funciones corren con `verify_jwt = false`.

Body:
```json
{ "savedIsochroneId": "uuid de la isócrona" }
```

Respuesta 200:
```json
{
  "savedIsochroneId": "uuid",
  "locationName": "Fontova (express)",
  "slide1": "data:image/png;base64,...",   // 1920×1080 — Análisis territorial
  "slide2": "data:image/png;base64,...",   // 1920×1080 — Proyección; null si la isócrona no tenía proyección
  "generatedAt": "2026-08-18T02:17:04.318Z",
  "alreadyConsumed": false,
  "consumedAt": "2026-08-18T02:17:05.689Z"
}
```

Errores: `401 {"error":"unauthorized"}` · `400` body inválido ·
`422 {"error":"Esta isócrona no tiene láminas guardadas. …"}` cuando el analista
todavía no las generó en Geochile.

## Semántica de consumo — importante

Pedir las láminas NO las borra: marca `consumed_at`. La fila se borra sola
después (48 h si se consumió, 30 días si nadie la fue a buscar).

Consecuencias para el diseño de este lado:

- Pedir la misma isócrona dos veces dentro de la ventana devuelve lo mismo, con
  `alreadyConsumed: true`. Un reintento tras una descarga fallida funciona.
- Pero NO son permanentes: no las trates como un recurso estable ni guardes solo
  el id esperando poder volver a buscarlas semanas después. Si el Informe
  Directorio las necesita más tarde, **persiste los PNG de este lado** al
  momento de traerlas.
- `alreadyConsumed: true` en una primera descarga significa que alguien más ya
  las tomó. No es un error; sirve para avisar en la UI.

## Qué construir

**1. Cliente.** En `src/lib/geochile/client.ts`, junto a `listSavedIsochrones` y
`fetchSalesProjection`, agrega:

```ts
export interface ReportSlidesExport {
  savedIsochroneId: string;
  locationName: string | null;
  slide1: string;
  slide2: string | null;
  generatedAt: string;
  alreadyConsumed: boolean;
  consumedAt: string;
}

export function fetchReportSlides(
  savedIsochroneId: string,
  settings?: GeochileSettings,
): Promise<ReportSlidesExport> {
  return callGeochileFunction<ReportSlidesExport>(
    "export-report-slides",
    { body: { savedIsochroneId }, settings },
  );
}
```

`SavedIsochroneSummary` (de `list-saved-isochrones`) ahora trae también
`hasSlides: boolean`. Agrégalo a la interfaz y úsalo para no pedir láminas de
isócronas que no las tienen — evita un 422 por cada una.

**2. Persistencia local.** Los PNG solo viven ~48 h en Geochile. Guarda los que
traigas en este proyecto, asociados al contrato. Usa Storage, NO una columna de
la base: son ~500 KB cada uno y en base64 crecen otro 33%. Sigue el patrón del
bucket privado `board-reports` que ya existe
(`supabase/migrations/20260817160000_board_report_shares.sql`): bucket privado,
policies de admin, y acceso por signed URL.

**3. Insertar en el PPT.** En `src/components/reports/InformeDirectorioPPT.ts`,
por cada contrato que tenga láminas, agrega 1–2 slides con la imagen a sangre
completa:

```ts
const slide = pres.addSlide();
slide.addImage({ data: slide1, x: 0, y: 0, w: 10, h: 5.625 });
```

Las láminas ya vienen en 16:9 a 1920×1080, o sea exactamente 10 × 5.625" al
layout `LAYOUT_16x9` que este deck ya usa. No las escales ni les pongas
márgenes: se verían deformadas o con bandas.

Van DESPUÉS de las slides del Business Case de ese contrato, para que el orden
sea "números del contrato → territorio que los respalda".

**4. UI.** El diálogo que ya existe (`AssignIsochroneDialog`) vincula un
contrato con una isócrona. Cuando la isócrona vinculada tenga `hasSlides`,
muestra que hay láminas disponibles y permite traerlas. Si el endpoint responde
422, muestra el mensaje tal cual viene: le dice al analista exactamente qué
hacer en Geochile.

## Restricciones

- No toques `callGeochileFunction` ni la configuración de la integración: ya
  funcionan y los usan `listSavedIsochrones` / `fetchSalesProjection`.
- No cambies el diseño de las slides existentes del Informe Directorio.
- La rama de trabajo es `migration` y NO auto-sincroniza: hace falta
  `git push origin migration` explícito después de cada commit.
