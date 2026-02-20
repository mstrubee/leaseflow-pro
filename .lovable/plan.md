

## Busqueda por Local (Contrato) en el Organigrama

### Objetivo
Agregar un campo de busqueda en el organigrama que permita escribir el nombre de un local/contrato y destacar visualmente a las personas relacionadas con ese contrato.

### Cambios en `src/components/admin/OrgChartManager.tsx`

1. **Nuevo estado de busqueda**
   - `searchContract`: string con el texto de busqueda.
   - `highlightedMemberIds`: Set de IDs de miembros que coinciden con la busqueda.

2. **Logica de filtrado**
   - Cuando el usuario escribe en el campo de busqueda, se buscan contratos cuyo nombre contenga el texto (case-insensitive) usando los datos ya cargados en `allContracts`.
   - Se recorre `memberContractMap` para encontrar que miembros tienen asignados esos contratos coincidentes.
   - Se almacenan esos IDs en `highlightedMemberIds`.

3. **Campo de busqueda en la UI**
   - Se agrega un `Input` con icono de `Search` junto a los botones existentes del header ("Imagen" y "Nuevo Miembro"), dentro del `headerActions`.
   - Placeholder: "Buscar por local/contrato..."

4. **Destacar nodos coincidentes**
   - En `renderOrgNode`, si el miembro esta en `highlightedMemberIds`, se aplica un estilo visual distinto: borde destacado con color primario, fondo con tinte de color, y una leve animacion de pulso o sombra para que sea facilmente identificable.
   - Si la busqueda esta activa pero el miembro NO coincide, se reduce la opacidad del nodo para generar contraste.

### Detalle tecnico

```text
headerActions:
  [Input busqueda] [Btn Imagen] [Btn Nuevo Miembro]

Logica (useMemo):
  contractMatches = allContracts.filter(name includes searchText)
  matchedContractIds = contractMatches.map(c => c.id)
  highlightedMemberIds = members que tengan algun contrato en matchedContractIds

renderOrgNode:
  Si highlightedMemberIds tiene el member.id:
    -> ring-2 ring-yellow-400 bg-yellow-50 shadow-lg
  Si busqueda activa y NO coincide:
    -> opacity-40
```

No se requieren cambios en la base de datos ni en otros archivos.
