
# Desglose de Arriendo Total por Periodo de Escalonamiento

## Objetivo
Agregar una tabla compacta dentro de la seccion "Total Arriendo" (en el area colapsable "Ver detalle") que muestre el **Total Arriendo por cada periodo del escalonamiento**, incluyendo Canon, GGCC, Fondo de Promocion y Otros Egresos.

## Comportamiento
- Solo se muestra cuando el contrato tiene escalones definidos (`hasEscalations = true`)
- Se ubica dentro del area expandible del "Total Arriendo", debajo del desglose actual (Canon, GGCC, F.Prom, Otros, Variable)
- Para cada periodo de escalonamiento se calcula:
  - **Canon**: monto del escalon (multiplicado por superficie si es UF/m2)
  - **GGCC**: se mantiene fijo (no depende del canon)
  - **F. Prom**: porcentaje aplicado sobre el canon de ese periodo
  - **Otros**: monto fijo
  - **Total**: suma de los anteriores

## Ejemplo visual

```text
Periodo 1 (M1-M12):    Canon 158,80 + GGCC 59,55 + F.Prom 0 + Otros 0 = 218,35 UF  (0,55 UF/m2)
Periodo 2 (M13-M24):   Canon 174,70 + GGCC 59,55 + ...                 = 234,25 UF  (0,59 UF/m2)
Periodo 3 (M25-M36):   ...
```

Se mostrara en formato tabla compacta con columnas: Periodo, Canon, GGCC, F.Prom, Otros, Total, y opcionalmente UF/m2.

## Cambios tecnicos

### `src/components/contracts/CommercialConditionsSummary.tsx`

1. **Nuevo `useMemo` para calcular los periodos**: Iterar sobre los escalones ordenados por `month_number`, construyendo un array de periodos con:
   - Mes inicio / mes fin de cada tramo
   - Canon del periodo (considerando `is_uf_m2` y superficie)
   - GGCC (fijo, ya calculado como `gastosComunesTotalUF`)
   - Fondo Promocion = canon_periodo * (fondo_promocion_percentage / 100)
   - Otros egresos (fijo)
   - Total = canon + GGCC + F.Prom + Otros
   - Total UF/m2 = Total / superficie

2. **Incluir el periodo inicial** (desde mes 1 o fin de gracia hasta el primer escalon) usando `initial_rent` o `regime_rent` como canon base.

3. **Renderizar la tabla** dentro del bloque `totalArriendoExpanded`, despues del desglose actual, separado por un borde superior sutil. Formato compacto con `text-[10px]`.

4. **Condicional**: Solo renderizar si `hasEscalations && escalationPeriods.length > 1`.
