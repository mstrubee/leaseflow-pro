
## Plan: Corregir búsqueda lenta y expandir funcionalidad

### Problema Identificado

La escritura en el campo de búsqueda es lenta y errática debido a dos factores principales:

1. **Actualización de URL en cada tecla**: Cada carácter escrito actualiza los parámetros de URL (`setSearchParams`), lo que causa re-renders completos
2. **Llamadas duplicadas a la base de datos**: El hook `useContractColumnWidths` se invoca en múltiples componentes, generando solicitudes repetidas a `user_preferences`

Además, la búsqueda actual solo filtra por nombre de contrato, sin incluir CEBE, dirección o comuna.

---

### Solución Propuesta

#### Parte 1: Optimizar rendimiento del input de búsqueda

**Archivo: `src/pages/Contracts.tsx`**

1. Crear un estado local para el input de búsqueda separado del parámetro URL:
   - Agregar `const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)`
   - El input controlará `localSearchTerm` para respuesta inmediata

2. Implementar debounce para actualizar la URL:
   - Usar `useEffect` con `setTimeout` de 300ms
   - Solo actualizar `searchParams` después de que el usuario deje de escribir

3. Sincronizar estado local cuando cambie el URL externamente:
   - Usar otro `useEffect` que actualice `localSearchTerm` cuando `searchTerm` cambie desde URL

```text
Flujo optimizado:
Usuario escribe -> localSearchTerm actualiza (inmediato)
                -> después de 300ms sin escribir -> URL actualiza
                -> filterAndSortContracts se ejecuta
```

#### Parte 2: Expandir búsqueda para incluir CEBE, dirección y comuna

**Archivo: `src/pages/Contracts.tsx`**

1. Modificar la carga de contratos para incluir valores de campos personalizados:
   - Agregar subconsulta para obtener `contract_custom_field_values`
   - Incluir relación con `contract_custom_fields` para identificar el campo CEBE

2. Actualizar la interfaz `Contract` para incluir campo de CEBE opcional

3. Modificar la función `filterAndSortContracts`:
   - Expandir el filtro de búsqueda de texto para buscar en:
     - `contract.name` (actual)
     - `contract.cebe` (CEBE del campo personalizado)
     - `address.street` + `address.number` (dirección)
     - `address.commune` (comuna)
     - `address.region` (región)

```text
Lógica de búsqueda expandida:
const term = searchTerm.toLowerCase();
filtered = filtered.filter((contract) => {
  const name = contract.name?.toLowerCase() || '';
  const cebe = contract.cebe?.toLowerCase() || '';
  const address = contract.contract_addresses?.[0];
  const street = address?.street?.toLowerCase() || '';
  const number = address?.number?.toLowerCase() || '';
  const commune = address?.commune?.toLowerCase() || '';
  const region = address?.region?.toLowerCase() || '';
  const fullAddress = `${street} ${number}`.trim();
  
  return name.includes(term) || 
         cebe.includes(term) || 
         fullAddress.includes(term) || 
         commune.includes(term) ||
         region.includes(term);
});
```

#### Parte 3: Actualizar placeholder del input

**Archivo: `src/pages/Contracts.tsx`**

Cambiar el placeholder para reflejar las nuevas capacidades de búsqueda:
- De: `"Buscar contratos..."`
- A: `"Buscar por nombre, CEBE, dirección o comuna..."`

---

### Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/Contracts.tsx` | Agregar debounce, expandir lógica de búsqueda, cargar CEBE |

---

### Detalles Técnicos

**Implementación del debounce:**
```typescript
// Estado local para respuesta inmediata
const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

// Sincronizar con URL después de debounce
useEffect(() => {
  const timer = setTimeout(() => {
    if (localSearchTerm !== searchTerm) {
      setSearchTerm(localSearchTerm);
    }
  }, 300);
  return () => clearTimeout(timer);
}, [localSearchTerm]);

// Sincronizar estado local cuando URL cambia externamente
useEffect(() => {
  setLocalSearchTerm(searchTerm);
}, [searchTerm]);
```

**Modificación de loadContracts:**
```typescript
// Agregar carga de CEBE
const { data: cebeField } = await supabase
  .from('contract_custom_fields')
  .select('id')
  .ilike('field_name', 'cebe')
  .eq('is_active', true)
  .maybeSingle();

// En la consulta principal, incluir valores personalizados
.select(`
  *,
  ...campos existentes...,
  contract_custom_field_values!inner (
    field_id,
    field_value
  )
`)
```

---

### Resultado Esperado

1. **Escritura fluida**: El input responderá inmediatamente, sin lag perceptible
2. **Búsqueda ampliada**: Los usuarios podrán encontrar contratos por:
   - Nombre del contrato
   - Código CEBE
   - Dirección (calle y número)
   - Comuna
   - Región
3. **Menor carga en base de datos**: Las solicitudes de filtrado se reducirán gracias al debounce
