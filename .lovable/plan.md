

## Mostrar "Last Seen" cuando el usuario esta desconectado

### Cambio
En la tabla de usuarios del Admin Panel, cuando un usuario aparece como "Desconectado", mostrar debajo la fecha y hora de su ultima conexion (last_seen_at) en formato legible, por ejemplo: "Visto por ultima vez: 27/02/2026 14:30".

Si nunca se ha conectado (last_seen_at es null), mostrar "Sin actividad registrada".

### Archivo afectado
- `src/pages/AdminPanel.tsx` -- agregar linea de texto debajo de "Desconectado" con la fecha formateada usando `date-fns` (ya instalado).

### Detalle tecnico
Despues del indicador "Desconectado", agregar un bloque condicional similar al que ya existe para "Trabajando en...":

```typescript
{!isOnline && (
  <span className="text-[10px] text-muted-foreground ml-4">
    {profile.last_seen_at 
      ? `Visto: ${format(new Date(profile.last_seen_at), "dd/MM/yyyy HH:mm")}`
      : "Sin actividad registrada"}
  </span>
)}
```
