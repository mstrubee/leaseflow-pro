
# Solucion para visualizar todo el organigrama

## Problema
El organigrama se escala demasiado pequeno porque el contenedor usa `overflow-hidden` y el unico mecanismo para ajustar es reducir el `scale`. Aunque se aumento el `max-w` del panel, el organigrama sigue sin caber completo.

## Solucion
Cambiar el enfoque: en vez de solo escalar hacia abajo (lo que hace todo ilegible), permitir **scroll horizontal** cuando el organigrama es mas ancho que el contenedor, y aplicar un scale minimo mas razonable.

### Cambios en `src/components/admin/OrgChartManager.tsx`:

1. **Cambiar `overflow-hidden` a `overflow-x-auto`** en el contenedor (linea 582) para permitir scroll horizontal cuando el chart no cabe.

2. **Ajustar la logica de auto-scale** (lineas 253-269): En vez de reducir el scale indefinidamente, usar un minimo mas alto (por ejemplo 0.55) y dejar que el scroll horizontal se encargue del resto. Esto mantiene el organigrama legible y navegable.

3. **Agregar altura al contenedor escalado**: Cuando se aplica `scale`, el contenedor padre no ajusta su altura automaticamente. Se agregara un calculo de altura para evitar que el contenido se corte verticalmente.

### Detalles tecnicos

**Linea 582** - Contenedor:
- De: `className="overflow-hidden pb-4"`
- A: `className="overflow-x-auto pb-4"`

**Lineas 253-262** - Logica de scale:
- Subir el minimo de scale de 0.2 a 0.55
- Cuando el chart escalado siga sin caber, el scroll horizontal se activara automaticamente

**Lineas 585-591** - Wrapper del chart:
- Agregar `min-w-max` al div del chart para que mantenga su tamano natural y active el scroll cuando sea necesario
- Ajustar el `height` del contenedor proporcionalmente al scale para evitar corte vertical
