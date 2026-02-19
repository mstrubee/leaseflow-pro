
# Mejora del Organigrama: Layout Compacto y Lineas de Dependencia

## Problema Actual
El organigrama se reduce demasiado (scale) porque los nodos tienen mucho espacio entre si (gaps grandes). Las lineas de conexion entre niveles son muy finas y poco visibles.

## Solucion

### 1. Layout Compacto
- Reducir el `gap-6` entre nodos raiz a `gap-1`
- Reducir el `gap-2` entre hijos a `gap-0`
- Eliminar padding lateral innecesario en los nodos
- Reducir el `min-w` de los nodos de 120px a 100px
- Usar texto mas compacto (text-xs en vez de text-sm para nombres)

### 2. Mejores Lineas de Dependencia
- Aumentar el grosor de las lineas verticales de `w-px` a `w-[2px]`
- Usar un color mas visible (border-primary/40 o similar)
- Para la linea horizontal que conecta hermanos, usar una barra solida de 2px de alto con bordes redondeados
- Agregar esquinas redondeadas en las conexiones (linea vertical baja del padre, linea horizontal conecta hijos, linea vertical baja a cada hijo)

### 3. Auto-scale Mejorado
- Reducir el minimo de scale de 0.3 a 0.2 para permitir mas reduccion si es necesario
- Recalcular el scale despues de cada cambio de layout

## Detalles Tecnicos

**Archivo a modificar:** `src/components/admin/OrgChartManager.tsx`

**Cambios en renderOrgNode (lineas 506-538):**
- Linea vertical padre-a-barra: `w-[2px] h-5 bg-primary/30` (en vez de `w-px h-4 bg-border`)
- Barra horizontal: `h-[2px] bg-primary/30 rounded-full` con ancho calculado de primer a ultimo hijo
- Lineas verticales barra-a-hijo: `w-[2px] h-5 bg-primary/30`

**Cambios en layout principal (linea 588):**
- Root: `flex gap-1 justify-center` (antes gap-6)
- Children container: `flex gap-0` (antes gap-2)

**Cambios en nodos (lineas 437-460):**
- Nodo: `px-2.5 py-1.5 min-w-[90px]` (antes px-4 py-2.5 min-w-[120px])
- Nombre: `text-xs` (antes text-sm)
- Cargo: `text-[10px]` (antes text-[11px])

**Estructura de conectores mejorada para multiples hijos:**
```text
       [Padre]
          |          <- linea vertical 2px
    ------+------    <- barra horizontal 2px
    |     |     |    <- lineas verticales 2px a cada hijo
  [H1]  [H2]  [H3]
```

Se usara un enfoque con posicionamiento relativo para la barra horizontal, calculando que vaya desde el centro del primer hijo hasta el centro del ultimo hijo.
