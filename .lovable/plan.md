

# Optimizar carga del Repositorio Comun de Patentes

## Problema

La funcion `loadContents` en `PatentSharedRepository.tsx` (lineas 89-120) hace lo siguiente:

1. Consulta todas las carpetas en una sola peticion.
2. Luego, **para cada carpeta**, hace una peticion individual para contar archivos (`select("id", { count: 'exact', head: true })`).

Con ~30 carpetas, esto genera ~31 peticiones HTTP secuenciales (una por carpeta + la inicial). Cada peticion toma entre 100-300ms, resultando en tiempos de carga de 5-15 segundos.

## Solucion

Reemplazar las N consultas individuales de conteo por **una sola consulta SQL** que devuelva los conteos agrupados por `folder_id`.

### Cambio en PatentSharedRepository.tsx

Modificar `loadContents` para:

1. Obtener las carpetas (sin cambios).
2. Obtener los conteos de archivos de todas las carpetas de una sola vez, usando una consulta que agrupe por `folder_id`.
3. Combinar los resultados en memoria.

En lugar de:
```text
// ACTUAL: N consultas secuenciales (lento)
for (const folder of folderData) {
  const { count } = await supabase
    .from("repository_files")
    .select("id", { count: 'exact', head: true })
    .eq("folder_id", folder.id);
  foldersWithCounts.push({ ...folder, fileCount: count ?? 0 });
}
```

Usar:
```text
// NUEVO: 1 sola consulta (rapido)
const folderIds = folderData.map(f => f.id);
const { data: countData } = await supabase
  .from("repository_files")
  .select("folder_id")
  .in("folder_id", folderIds);

// Contar en memoria
const countMap: Record<string, number> = {};
for (const row of countData || []) {
  countMap[row.folder_id] = (countMap[row.folder_id] || 0) + 1;
}

const foldersWithCounts = folderData.map(f => ({
  ...f,
  fileCount: countMap[f.id] || 0
}));
```

Esto reduce ~31 peticiones HTTP a solo 2 (carpetas + conteos), bajando el tiempo de carga de 5-15 segundos a menos de 1 segundo.

### Consideracion: limite de 1000 filas

Si hay mas de 1000 archivos en total, la consulta de conteo podria truncarse. Para manejar esto de forma robusta, una alternativa es crear una funcion de base de datos (RPC) que haga el conteo directamente en SQL:

```sql
CREATE OR REPLACE FUNCTION get_folder_file_counts(p_folder_ids UUID[])
RETURNS TABLE(folder_id UUID, file_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rf.folder_id, COUNT(*)::BIGINT as file_count
  FROM repository_files rf
  WHERE rf.folder_id = ANY(p_folder_ids)
  GROUP BY rf.folder_id;
$$;
```

Y llamarla desde el frontend:
```text
const { data: counts } = await supabase
  .rpc("get_folder_file_counts", { p_folder_ids: folderIds });
```

Esta es la opcion recomendada ya que no tiene limite de filas y es mas eficiente al ejecutarse directamente en la base de datos.

### Resumen de cambios

1. **Migracion SQL**: Crear funcion `get_folder_file_counts` que reciba un array de UUIDs y devuelva conteos agrupados.
2. **PatentSharedRepository.tsx**: Reemplazar el bucle `for` de conteos individuales por una sola llamada RPC.

### Resultado esperado

- De ~31 peticiones HTTP a 2 peticiones
- De 5-15 segundos de carga a menos de 1 segundo
