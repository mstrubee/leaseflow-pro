import { useCallback, useState } from "react";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";

interface UseCloseGuardOptions {
  /** ¿Hay cambios sin guardar? Si no, la ventana se cierra directo. */
  isDirty: boolean;
  /** Cierra la ventana (sin guardar). */
  onClose: () => void;
  /**
   * Guarda lo pendiente. Cada ventana usa su propia acción de guardar: si sale bien, la ventana se cierra
   * (la acción la cierra, o devuelve true); si falla o faltan datos, avisa y la ventana sigue abierta.
   */
  onSave: () => Promise<boolean | void>;
}

/**
 * Protege el cierre de una ventana emergente con cambios sin guardar. Llamar `requestClose()` desde la X,
 * Escape, "Cancelar" o cualquier botón de cierre; renderizar `guard` junto a la ventana.
 *
 * Nunca guarda por su cuenta: solo si la persona elige "Guardar".
 */
export function useCloseGuard({ isDirty, onClose, onSave }: UseCloseGuardOptions) {
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) setAsking(true);
    else onClose();
  }, [isDirty, onClose]);

  const guard = (
    <UnsavedChangesDialog
      open={asking}
      saving={saving}
      onContinue={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false);
        onClose();
      }}
      onSave={async () => {
        setSaving(true);
        try {
          const result = await onSave();
          // Si la acción de guardar devuelve true (y no cerró por su cuenta), se cierra aquí.
          if (result === true) onClose();
        } finally {
          setSaving(false);
          setAsking(false);
        }
      }}
    />
  );

  return { requestClose, guard, asking };
}
