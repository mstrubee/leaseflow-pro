## Plan: Registro de Reuniones en módulo "Atención Especial"

### Objetivo
Agregar un botón **"Registro Reuniones"** en el header de `/special-attention` que abra un diálogo flotante con: (a) registro inmediato de una reunión nueva (fecha automática + participantes + notas), (b) listado histórico colapsable agrupado por **año › mes › reunión**, y (c) generación + almacenamiento de un PDF por cada reunión registrada.

---

### 1. Base de datos (migración nueva)

Crear dos tablas en `public`:

**`special_attention_meetings`**
- `id uuid PK default gen_random_uuid()`
- `meeting_date timestamptz not null default now()` — fecha/hora del registro
- `notes text` — notas opcionales de la reunión
- `pdf_url text` — URL pública del PDF generado en Storage
- `pdf_path text` — path interno en bucket
- `snapshot jsonb` — snapshot de los contratos en atención especial al momento del registro (para que el PDF histórico siempre refleje lo que se vio ese día)
- `created_by uuid references auth.users(id)`
- `created_at timestamptz default now()`

**`special_attention_meeting_participants`**
- `id uuid PK default gen_random_uuid()`
- `meeting_id uuid references special_attention_meetings(id) on delete cascade`
- `name text not null`
- `role text` — opcional (cargo)
- `created_at timestamptz default now()`

**RLS**: ambas tablas con políticas `authenticated` para `select/insert/update/delete` (mismo patrón que `special_attention_checklist`). Los usuarios autenticados pueden gestionar todas las reuniones (no es información sensible por contrato).

**Storage**: reusar bucket existente `repository-files` con prefijo `special-attention-meetings/{yyyy}/{mm}/{meeting-id}.pdf`. No requiere bucket nuevo.

---

### 2. Componente nuevo: `MeetingsRegistryDialog.tsx`

Ubicación: `src/components/special-attention/MeetingsRegistryDialog.tsx`

**Estructura visual (Dialog grande, ~max-w-4xl):**

- **Header**: título "Registro de Reuniones — Atención Especial" + botón "Expandir/Contraer todo" (afecta sólo este diálogo).
- **Sección superior — Nueva reunión**:
  - Lista editable de participantes (input con `Plus` para agregar, `X` para quitar; chips con nombre y rol opcional).
  - Textarea opcional de notas.
  - Botón principal **"Registrar"** (icono `CalendarPlus`):
    1. Inserta fila en `special_attention_meetings` con `meeting_date = now()` y snapshot de contratos actuales.
    2. Inserta participantes.
    3. Genera PDF con `exportMeetingPDF` (ver §3) y lo sube al bucket.
    4. Actualiza `pdf_url` y `pdf_path` en el registro.
    5. Toast de éxito + refresca historial + limpia inputs.
- **Sección inferior — Historial agrupado**:
  - Estructura `Collapsible` anidada: **Año › Mes › Reunión**.
  - Cada nivel muestra contador (ej: "2026 (12 reuniones)", "abril (3)").
  - Por reunión: fecha completa formateada (`yyyy.mm.dd HH:mm`), participantes (chips compactos), notas truncadas, y dos acciones:
    - **Descargar PDF** (`FileDown`) → abre `pdf_url` en nueva pestaña.
    - **Ver participantes** (expand inline) → muestra lista completa.
  - Botón papelera (admins) para eliminar registro + PDF asociado.
  - Estado `expandedYears`, `expandedMonths`, `expandedMeetings` con `Set<string>` independientes.
  - Botón global "Expandir/Contraer todo" alterna los 3 sets.

**Hook de datos**: query directo con `supabase.from("special_attention_meetings").select("*, special_attention_meeting_participants(*)").order("meeting_date", { ascending: false })`. Agrupar en cliente por `getFullYear()` y `getMonth()`.

---

### 3. Generador PDF: `exportMeetingPDF.ts`

Ubicación: `src/components/special-attention/exportMeetingPDF.ts`

Reutiliza la estructura visual de `exportSpecialAttentionPDF.ts` (logo header, barra roja, tablas) pero con:
- **Encabezado**: "Acta de Reunión — Atención Especial" + fecha del registro destacada.
- **Bloque participantes**: tabla con Nombre / Rol.
- **Bloque notas**: si existen.
- **Anexo**: snapshot de contratos en atención especial (mismo formato del export actual, para evidencia histórica).
- Devuelve `Blob` (no `doc.save()`) para poder subirlo a Storage:
  ```ts
  const blob = doc.output("blob");
  const path = `special-attention-meetings/${yyyy}/${mm}/${meetingId}.pdf`;
  await supabase.storage.from("repository-files").upload(path, blob, { contentType: "application/pdf" });
  const { data: { publicUrl } } = supabase.storage.from("repository-files").getPublicUrl(path);
  ```

---

### 4. Integración en `SpecialAttentionPage.tsx`

- Importar `MeetingsRegistryDialog` y `CalendarCheck` (lucide).
- Agregar estado `meetingsOpen` y botón en el header, junto a "PDF":
  ```tsx
  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMeetingsOpen(true)}>
    <CalendarCheck className="h-4 w-4" />
    Registro Reuniones
  </Button>
  ```
- Pasar `contracts` actuales al diálogo para construir el snapshot al registrar.

---

### 5. Detalles UX

- Al registrar, deshabilitar botón con spinner mientras se genera/sube el PDF.
- Si la subida del PDF falla, el registro se mantiene pero se marca con badge "PDF pendiente" y se ofrece reintentar.
- Participantes pueden marcarse como "frecuentes" en sesión (sessionStorage) para reutilizar entre reuniones del día.
- Mes y año por defecto **expandidos** sólo para el período actual; resto colapsado al abrir.

---

### Archivos a crear/modificar

**Nuevos:**
- `src/components/special-attention/MeetingsRegistryDialog.tsx`
- `src/components/special-attention/exportMeetingPDF.ts`
- Migración SQL: tablas + RLS

**Modificados:**
- `src/pages/SpecialAttentionPage.tsx` (botón + dialog mount)

**Sin cambios:**
- `exportSpecialAttentionPDF.ts` (sigue funcionando para export general)
- Bucket de storage (reusa `repository-files`)

---

### Confirmación pendiente
Antes de implementar, ¿quieres que los participantes sean **texto libre** (escribir nombre cada vez) o que se vinculen a una **lista maestra reutilizable** (tabla `meeting_participants_directory` con autocompletado)? La opción simple es texto libre — más rápida y cubre el caso de uso descrito.