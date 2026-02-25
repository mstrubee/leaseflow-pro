

## Plan: Agregar columna "Fecha" al PDF diario

El boton de descarga PDF ya existe en el card de fecha. Solo falta agregar la columna **"Fecha"** del form al PDF, ya que actualmente no se incluye.

### Cambio en `src/components/maintenance/maintenanceExport.ts`

En la funcion `exportDailyFormsPDF`:

1. Agregar "Fecha" al array `head` despues de "N°":
   - De: `["N°", "Estado", "Sub Estado", "Local", ...]`
   - A: `["N°", "Fecha", "Estado", "Sub Estado", "Local", ...]`

2. Agregar `f.created_date || ""` al array `body` en la posicion correspondiente

3. Ajustar `columnStyles` para acomodar la nueva columna (desplazar indices en 1 a partir de la posicion 1, agregar ancho para la columna de fecha ~18px)

