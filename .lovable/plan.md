

## Plan: corregir conversión y visualización de montos al editar adicionales

### Problema confirmado
En el popover de desglose de adicionales (y en la fila de adicional pendiente), al editar un monto en CLP:

1. **El parser del input destruye el valor**: usa `replace(/\./g, "")` que borra TODOS los puntos. Si el usuario escribe `1500.50` → se convierte en `150050`. Si vuelve a editar un valor ya formateado con separadores chilenos, se confunde con decimales.
2. **Al abrir el editor, se ignora la moneda real de la línea**: el valor inicial siempre se pone como `absUf.toString()` y la moneda se fuerza a "UF". Si el adicional fue guardado en CLP, el usuario ve la cifra en UF pero con etiqueta CLP — al cambiar selector se reinterpreta mal y se divide otra vez por UF, produciendo cifras astronómicas o microscópicas.
3. **Resultado visible (captura)**: se almacenó `amount_uf` con magnitud de pesos (orden 10¹⁵), y por eso el desglose muestra `UF 8.564.253.204.138.165` y `$ 342.689.000.000.000.030.000`.

### Cambios

#### 1) `SurchargeBreakdownRow` (popover) — `src/components/budget/BudgetLineTree.tsx` (~líneas 1876-1986)

- **Inicialización correcta**: al abrir el editor, respetar la moneda guardada de la línea.
  - Si `surcharge.currency === "CLP"`: precargar el input con `Math.round(absUf * ufValue)` y selector en "CLP".
  - Si UF: precargar con `absUf` y selector en "UF".
- **Doble clic**: dejar de forzar `setAmountCurrency("UF")`. Usar la moneda original.
- **Parser robusto**: reemplazar `replace(/\./g, "").replace(",", ".")` por una lógica que:
  - Permita pegar valores con miles (ej. `1.500.000` o `1,500,000`).
  - Permita decimales con coma o punto.
  - Detecte el último separador como decimal sólo si va seguido de 1–3 dígitos sin más separadores.
- **Mostrar moneda en estado no-edición**: mantener el formato actual UF + CLP, pero ahora consistente con la moneda real almacenada.

#### 2) `PendingSurchargeRow` (fila amarilla) — mismas correcciones (~líneas 1587-1720)

Mismo parser nuevo, misma inicialización por moneda, misma eliminación del forzado a "UF" al hacer doble clic.

#### 3) Sanitización defensiva al guardar
En `commitAmount` (ambos componentes):
- Si `amountCurrency === "CLP"` y `ufValue` no es válido → mostrar mensaje y NO guardar (en vez de fallar silenciosamente).
- Validar que el resultado en UF no supere un umbral razonable (p.ej. > 10⁹ UF → abortar y avisar; protege contra futuros datos corruptos).

#### 4) Visualización segura del desglose (`SurchargeBreakdownPopover` ~líneas 1801-1856)
- Agregar fallback visual: si `originalUf` o `totalUf` superan `1e8` UF, mostrar la cifra en notación compacta (ej. `UF 8.56·10¹⁵`) y un ícono de advertencia "valor inconsistente — revisar". Esto evita romper el layout y deja claro que hay un dato a corregir.

#### 5) Migración de datos corruptos (opcional, recomendado)
Crear un mensaje en consola (o UI admin) que detecte líneas con `amount_uf > 1e8` y permita corregirlas dividiendo por `ufValue` con confirmación. No se ejecuta automático.

### Validación esperada
- Entrar al popover, ver el monto original en su moneda correcta.
- Doble clic en un adicional CLP → input precargado en pesos con separador correcto, selector "CLP".
- Editar `1.500.000` y Enter → se guarda como `1500000 / ufValue` en `amount_uf`.
- Cambiar selector a UF → input se reformatea al equivalente en UF sin perder valor.
- Los montos mostrados en UF y CLP coinciden con el valor ingresado.

### Archivos a editar
- `src/components/budget/BudgetLineTree.tsx`

