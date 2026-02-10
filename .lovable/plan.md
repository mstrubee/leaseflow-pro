

## Matching de contratos con IA para carga de FORMs

### Problema actual
El matching actual falla porque muchos textos del Excel (columna E) no coinciden directamente con el nombre del contrato ni contienen el CEBE completo. Hay multiples "Contrato no encontrado".

### Solucion propuesta
Crear un edge function `match-contracts` que use IA (Lovable AI) para hacer matching inteligente. El flujo sera:

1. **Recopilar los no-matcheados**: Despues del matching local actual (nombre directo, CEBE completo, prefijo), las filas que queden sin match se envian en batch a la edge function.

2. **Edge function `match-contracts`**: Recibe la lista de textos sin match + la lista completa de contratos con sus CEBEs. Usa el modelo `google/gemini-3-flash-preview` con tool calling para devolver un mapeo estructurado `{excelText -> contractId}`.

3. **Prompt de la IA**: Le indica que compare los primeros 4 digitos del texto de tienda del Excel contra los digitos 2-5 del CEBE (e.g., CEBE `H0428P1290` -> `0428`), y que ademas valide coincidencia parcial del nombre de tienda con el nombre del contrato. Devuelve solo matches con alta confianza.

4. **Integracion en `MaintenanceExcelUpload.tsx`**: Las filas sin match tras el paso local se agrupan y se envian a la edge function. Los resultados se aplican a las filas correspondientes.

### Cambios tecnicos

**Archivo nuevo: `supabase/functions/match-contracts/index.ts`**
- Recibe: `{ unmatchedTexts: string[], contracts: {id, name, cebe}[] }`
- Usa Lovable AI con tool calling para devolver `{ matches: [{text, contractId}] }`
- Prompt en espanol indicando las reglas de matching: primeros 4 digitos del Excel vs posiciones 2-5 del CEBE + validacion de nombre
- Manejo de errores 429/402

**Archivo modificado: `supabase/config.toml`**
- Agregar `[functions.match-contracts]` con `verify_jwt = false`

**Archivo modificado: `src/components/maintenance/MaintenanceExcelUpload.tsx`**
- Despues del matching local, recopilar filas sin `contract_id`
- Llamar a la edge function con los textos no matcheados + lista de contratos/CEBEs
- Aplicar los resultados de IA a las filas
- Mostrar indicador visual (icono de IA) en las filas matcheadas por IA vs las matcheadas localmente
- Agregar estado de loading "Buscando contratos con IA..." durante la llamada

### Flujo de matching (prioridad)

```text
Fila Excel (col E)
    |
    v
1. Match por nombre directo
    |-- Si: asignar contrato
    |-- No: continuar
    v
2. Match por CEBE completo en texto
    |-- Si: asignar contrato
    |-- No: continuar
    v  
3. Match por prefijo CEBE
    |-- Si: asignar contrato
    |-- No: acumular para IA
    v
4. Batch a edge function (IA)
    |-- Compara 4 primeros digitos del Excel
    |   vs digitos 2-5 del CEBE
    |-- Valida nombre de tienda
    |-- Retorna matches con confianza
    v
5. Sin match -> warning "Contrato no encontrado"
```

### Ejemplo concreto
- Excel dice: `0428 - 10 De Julio`
- CEBE: `H0428P1290` -> digitos 2-5 = `0428` (coincide)
- Nombre contrato: `10 De Julio` (coincide)
- Resultado: match con alta confianza

