
Objetivo
- Corregir el error al crear contratos: `There is no unique or exclusion constraint matching the ON CONFLICT specification`.

Diagnóstico
- El fallo no viene del formulario de `src/pages/NewContract.tsx`, sino de un trigger de base de datos que corre al insertar en `contracts`.
- La función `public.create_general_folder_for_contract()` hace:
  `INSERT INTO general_folders (...) ... ON CONFLICT (contract_id) DO NOTHING;`
- Pero en migraciones solo existe un índice único parcial:
  `CREATE UNIQUE INDEX unique_general_folder_contract ON general_folders (contract_id) WHERE contract_id IS NOT NULL;`
- Ese índice parcial no calza con `ON CONFLICT (contract_id)`, por eso Postgres lanza ese error al crear el contrato.

Plan de fix
1. Ajustar la base de datos para que `ON CONFLICT (contract_id)` sea válido
- Crear una migración que reemplace el índice parcial por una restricción/índice único no parcial sobre `general_folders.contract_id`.
- Mantener `contract_id` nullable para no romper carpetas globales; múltiples `NULL` seguirán siendo válidos.

2. Asegurar consistencia del trigger
- Revisar y volver a definir `public.create_general_folder_for_contract()` para que use la forma correcta y estable del insert.
- Mantener la lógica actual de nombre de carpeta y deduplicación por calle/sufijo.

3. Verificar impacto en creación de contratos
- Confirmar que el flujo de `src/pages/NewContract.tsx` no requiere cambios, porque el insert a `contracts` ya es correcto.
- El problema es backend-only.

4. Validación
- Probar creación de un contrato nuevo.
- Confirmar que:
  - el contrato se inserta,
  - se crea su carpeta en `general_folders`,
  - no aparece el error de `ON CONFLICT`,
  - no se duplican carpetas para el mismo contrato.

Archivos a tocar
- `supabase/migrations/...` (nueva migración)
- opcionalmente redefinición dentro de la misma migración de `public.create_general_folder_for_contract()`

Detalle técnico
- Causa raíz exacta: `ON CONFLICT (contract_id)` requiere una restricción única o exclusion constraint compatible; el proyecto hoy tiene solo un índice único parcial, que no coincide con esa especificación.
- La solución más segura es alinear la estructura de `general_folders.contract_id` con el upsert real usado por el trigger.
