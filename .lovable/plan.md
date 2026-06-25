# Exportar cronogramas para la migración

## Objetivo
Permitir exportar todos los cronogramas (Gantt) con su estructura jerárquica, responsable, dependencias (precedentes/dependientes), fecha de inicio, plazo y fecha de término, en un formato que la migración pueda leer y re-importar sin perder relaciones. La descarga se hace desde el botón **"Exportar datos"** del panel Admin.

## Qué falta hoy
El módulo **Gantt** actual del exportador solo saca `gantt_tasks`, `gantt_timelines`, `gantt_templates` y `gantt_template_tasks`. **No incluye** las dependencias ni los vínculos a OC, por lo que la migración no puede reconstruir precedencias ni plazos:
- `gantt_task_dependencies` (`task_id`, `depends_on_task_id`, `dep_type`, `lag_days`, `lag_type`)
- `gantt_task_purchase_orders` (vínculo tarea ↔ orden de compra)
- `gantt_template_dependencies` (precedencias de plantilla)

## Solución
Agregar un nuevo módulo en el selector del diálogo `DataExportDialog.tsx`: **"Cronogramas (completo)"**. A diferencia de los módulos normales (solo CSV), este genera un ZIP con dos formatos.

### Contenido del ZIP

**1. CSV por tabla** (IDs/UUID y claves foráneas intactas, para re-import directo en el Supabase de destino):
- `gantt_timelines.csv`
- `gantt_tasks.csv`
- `gantt_task_dependencies.csv`
- `gantt_task_purchase_orders.csv`
- `gantt_templates.csv`
- `gantt_template_tasks.csv`
- `gantt_template_dependencies.csv`
- `org_members_basic.csv` (solo `id`, `name`, `position` vía RPC `get_org_members_basic` — sin email/teléfono, respetando la restricción de PII)

**2. JSON anidado** (`cronogramas.json`), autocontenido y legible:
```text
{
  cronogramas: [
    {
      timeline_id, contract_id, contract_name, name,
      tasks: [   // jerárquico por parent_id + display_order
        {
          id, name, parent_id,
          responsible: { id, name, position } | null,
          start_date, duration_days, duration_type, end_date,
          status, progress, color, origin,
          dependencies: [   // precedentes de esta tarea
            { depends_on_task_id, depends_on_task_name, dep_type, lag_days, lag_type }
          ],
          purchase_order_ids: [ ... ],
          children: [ ... ]   // recursivo
        }
      ]
    }
  ],
  templates: [   // plantillas en bloque aparte
    {
      template_id, name, description, is_active,
      tasks: [ { id, name, parent_id, default_duration_days, duration_type,
                 responsible, default_origin, dependencies: [...], children: [...] } ]
    }
  ]
}
```

### Detalles técnicos
- **Datos**: leer con el cliente Supabase ya existente (`from(...).select("*")` paginado con el helper `fetchAllRows` que ya está en el archivo). Las tablas Gantt tienen RLS por `can_access_gantt`; un admin pasa sin problema.
- **Nombre de contrato**: join en memoria con `contracts` (id → name) para enriquecer el JSON. El CSV conserva `contract_id`.
- **Responsable**: resolver `responsible_member_id` / `default_responsible_member_id` contra `get_org_members_basic()` (RPC ya existente, sin PII). El CSV mantiene el UUID; el JSON muestra `{ name, position }`.
- **Jerarquía**: construir el árbol desde `parent_id` ordenando por `display_order` (tanto tareas reales como de plantilla).
- **Dependencias**: por cada tarea, listar las filas donde `task_id = tarea` (precedentes), resolviendo `depends_on_task_id` al nombre de la tarea predecesora. Esto cubre "precedentes y dependientes" porque la relación queda completa y reconstruible en ambos sentidos.
- **Manejo de errores**: mismo patrón actual (si una tabla falla, se agrega `<tabla>_ERROR.txt` al ZIP y se reporta en el toast).
- **Solo cambia un archivo de frontend**: `src/components/admin/DataExportDialog.tsx`. Sin migraciones, sin cambios de backend ni de esquema.

### Cómo la migración lo lee (recomendación)
- Para re-importar en el Supabase nuevo: cargar los CSV en orden de dependencias FK → `gantt_timelines` → `gantt_tasks` → `gantt_task_dependencies` / `gantt_task_purchase_orders`; plantillas → `gantt_templates` → `gantt_template_tasks` → `gantt_template_dependencies`. Los UUID se conservan, así que las FK calzan tal cual.
- El `cronogramas.json` sirve para validar visualmente y/o para un script de migración que prefiera leer la estructura anidada en vez de re-armar los joins.

## Revisión
- `[SECURITY: ✅ OK]` Solo admins (el diálogo ya valida `isAdmin`); `org_members` se exporta sin email/teléfono vía RPC básica.
- `[QUALITY: ✅ OK]` Reutiliza helpers existentes (`fetchAllRows`, `rowsToCsv`, JSZip); el caso especial se aísla en una rama del handler.
- `[MIGRATION: ✅ OK]` CSV con UUID/FK intactos = re-import directo al Supabase de destino; cambio aditivo y reversible, sin tocar `main`/config.
