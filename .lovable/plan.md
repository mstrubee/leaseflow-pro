

## Secciones colapsadas por defecto al abrir un contrato

### Problema
Actualmente todas las secciones se abren expandidas por defecto (`collapsed: false`) cuando un usuario abre un contrato por primera vez. El usuario quiere que siempre esten colapsadas.

### Cambios

**1. `src/hooks/useContractSections.ts`** (detalle de contrato)
- Cambiar `collapsed: false` a `collapsed: true` en `getDefaultSections()` (linea 42)

**2. `src/hooks/useEditContractSections.ts`** (edicion de contrato)
- Cambiar `collapsed: false` a `collapsed: true` en `getDefaultSections()` (linea 42)

### Nota
Usuarios que ya tienen preferencias guardadas mantendran su configuracion actual. El cambio solo afecta la primera vez que un usuario abre un contrato, o si usa "Restablecer por defecto".
