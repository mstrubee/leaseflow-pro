

# Fix: Boton "Subir" deshabilitado tras clasificacion manual

## Problema detectado

El componente `PatentBulkUploadDialog.tsx` tiene un problema en la forma en que muestra los archivos clasificados manualmente. Cuando el usuario selecciona una carpeta para un archivo sin match automatico:

1. El `selectedFolderId` se actualiza correctamente en el estado.
2. Sin embargo, la interfaz sigue mostrando "Sin clasificar -- selecciona carpeta:" con el icono amarillo de advertencia, porque la condicion de renderizado (linea 246) verifica `entry.matchedFolder` (que siempre es `null` para estos archivos), no `entry.selectedFolderId`.
3. Esto da la impresion de que la seleccion no se registro, y el usuario no recibe confirmacion visual clara de que el archivo ya tiene carpeta asignada.

Ademas, si algun archivo tiene `selectedFolderId` todavia en `null`, el boton "Subir Todos" permanece deshabilitado por la condicion `allAssigned` (linea 96).

## Solucion

Modificar la logica de renderizado para que cuando un archivo tenga `selectedFolderId` asignado (ya sea por auto-match o seleccion manual), se muestre confirmacion visual en lugar del picker.

### Cambios en PatentBulkUploadDialog.tsx

**1. Icono de estado (lineas 227-236):** Cambiar la condicion para que muestre el check verde tambien cuando `selectedFolderId` esta asignado manualmente:

```text
Antes:  entry.matchedFolder ? <CheckCircle2 verde> : <AlertCircle amarillo>
Despues: (entry.matchedFolder || entry.selectedFolderId) ? <CheckCircle2 verde> : <AlertCircle amarillo>
```

**2. Info del archivo (lineas 246-278):** Cambiar la condicion de renderizado para considerar tres estados:
- Auto-clasificado (`matchedFolder` existe): mostrar nombre de la carpeta en verde.
- Manualmente clasificado (`selectedFolderId` existe pero `matchedFolder` es null): mostrar nombre de la carpeta seleccionada en azul, con opcion de cambiar.
- Sin clasificar (ni `matchedFolder` ni `selectedFolderId`): mostrar el picker de busqueda.

```text
Si matchedFolder:
  Mostrar "-> {matchedFolder.name}" en verde
Si no matchedFolder pero si selectedFolderId:
  Buscar nombre de la carpeta en la lista de folders
  Mostrar "-> {folderName}" en azul + boton "Cambiar"
  Al hacer clic en "Cambiar", resetear selectedFolderId a null para volver a mostrar el picker
Si no matchedFolder ni selectedFolderId:
  Mostrar el picker de busqueda (comportamiento actual)
```

**3. Nombre de carpeta seleccionada:** Para mostrar el nombre cuando se selecciona manualmente, buscar en el array `folders` el que tenga `id === entry.selectedFolderId`.

### Resumen de cambios

Un solo archivo modificado: `src/components/patents/PatentBulkUploadDialog.tsx`

- Actualizar condicion del icono de estado para incluir `selectedFolderId`
- Agregar un tercer estado de renderizado para archivos clasificados manualmente
- Agregar boton "Cambiar" para permitir re-seleccion
- Esto dara feedback visual claro de que la seleccion se registro y habilitara el boton "Subir Todos"
