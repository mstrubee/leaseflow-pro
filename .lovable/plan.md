

## Plan: Almacenamiento Exclusivo en Google Drive (Solo Repositorio)

### Alcance

**Lo que NO cambia (permanece igual):**
- `localStorage` - preferencias de usuario, anchos de columnas
- `user_preferences` en Supabase - configuraciones guardadas
- Últimas vistas y navegación del sistema
- Información de inputs del sistema
- Cualquier otro dato que no sea archivos del repositorio

**Lo que SÍ cambia:**
- Los archivos subidos al repositorio de contratos se almacenarán **exclusivamente en Google Drive**
- Se elimina el uso de Supabase Storage (`repository-files` bucket) para nuevas cargas

---

### Cambios Técnicos

#### 1. Modificar `MultiFileUploadDialog.tsx`

**Cambio principal en `uploadSingleFile`:**

```text
Flujo actual (líneas 238-332):
┌─────────────┐    ┌──────────────────┐    ┌───────────────┐
│ Archivo     │ -> │ Si hay Drive     │ -> │ Google Drive  │
│ seleccionado│    │ sino Supabase    │    │ o Storage     │
└─────────────┘    └──────────────────┘    └───────────────┘

Flujo propuesto:
┌─────────────┐    ┌──────────────────┐    ┌───────────────┐
│ Archivo     │ -> │ Verificar Drive  │ -> │ Solo Drive    │
│ seleccionado│    │ OBLIGATORIO      │    │ (sin Storage) │
└─────────────┘    └──────────────────┘    └───────────────┘
```

**Cambios específicos:**
- Eliminar el bloque `else` (líneas 287-306) que sube a Supabase Storage
- Agregar validación al inicio: si no hay `driveFolderId`, mostrar error y no permitir subida
- Crear subcarpetas en Drive automáticamente usando nueva acción del edge function

#### 2. Agregar Acción `ensureSubfolderExists` al Edge Function

Nueva acción en `supabase/functions/google-drive/index.ts`:

```typescript
case "ensureSubfolderExists": {
  const { parentDriveFolderId, folderName } = params;
  // Buscar carpeta existente o crearla
  let folder = await getFolderByName(accessToken, folderName, parentDriveFolderId);
  if (!folder) {
    folder = await createDriveFolder(accessToken, folderName, parentDriveFolderId);
  }
  result = folder;
  break;
}
```

#### 3. Actualizar `RepositorySection.tsx`

- Agregar validación antes de abrir el diálogo de upload
- Mostrar advertencia si el contrato no tiene Drive configurado
- Ofrecer botón para sincronizar el contrato con Drive primero

#### 4. Actualizar `repositoryBackup.ts`

Modificar las funciones de backup de OCs para usar Drive en lugar de Storage:
- `backupOCFileToRepository` → subir directamente a Drive
- `backupOCFromStorageUrl` → copiar archivo a Drive

---

### Validación Pre-Upload

Antes de permitir subir archivos, se verificará:

```typescript
// En MultiFileUploadDialog
if (!driveFolderId) {
  toast({
    variant: "destructive",
    title: "Drive no configurado",
    description: "Este contrato debe sincronizarse con Google Drive antes de subir archivos"
  });
  return;
}
```

---

### Sincronización de Subcarpetas

Cuando se sube una carpeta con estructura de subcarpetas:

1. Para cada subcarpeta en la ruta del archivo
2. Llamar a `ensureSubfolderExists` en el edge function
3. Obtener o crear la carpeta en Drive
4. Guardar `drive_folder_id` en la BD para caché

---

### Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/contracts/MultiFileUploadDialog.tsx` | Eliminar upload a Storage, hacer Drive obligatorio, agregar lógica para crear subcarpetas en Drive |
| `src/components/contracts/RepositorySection.tsx` | Validar que el contrato tenga Drive antes de permitir upload |
| `supabase/functions/google-drive/index.ts` | Agregar acción `ensureSubfolderExists` |
| `src/lib/repositoryBackup.ts` | Actualizar para subir OCs directamente a Drive |

---

### Manejo de Errores

- **Sin conexión a Drive**: Bloquear upload, mostrar mensaje claro para sincronizar primero
- **Fallo en upload a Drive**: Mostrar error específico, permitir reintentar
- **Fallo en crear subcarpeta**: Intentar crear en carpeta raíz del contrato como fallback

---

### Resultado Esperado

1. Los archivos del repositorio se guardan **solo en Google Drive**
2. Se libera espacio en Supabase Storage
3. El resto del sistema (localStorage, preferencias, vistas) permanece sin cambios
4. Los contratos sin Drive configurado mostrarán advertencia y opción de sincronizar

