import { useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TextareaWithAI } from "@/components/ui/textarea-with-ai";

interface SyncedTextareasProps {
  comments: string;
  nextActions: string;
  onCommentsChange: (value: string) => void;
  onNextActionsChange: (value: string) => void;
}

export const SyncedTextareas = ({
  comments,
  nextActions,
  onCommentsChange,
  onNextActionsChange,
}: SyncedTextareasProps) => {
  const ref1 = useRef<HTMLTextAreaElement>(null);
  const ref2 = useRef<HTMLTextAreaElement>(null);
  const syncing = useRef(false);

  const syncHeight = useCallback((source: HTMLTextAreaElement, target: HTMLTextAreaElement) => {
    if (syncing.current) return;
    syncing.current = true;
    target.style.height = source.style.height || `${source.offsetHeight}px`;
    syncing.current = false;
  }, []);

  useEffect(() => {
    const ta1 = ref1.current;
    const ta2 = ref2.current;
    if (!ta1 || !ta2) return;

    const observer1 = new ResizeObserver(() => syncHeight(ta1, ta2));
    const observer2 = new ResizeObserver(() => syncHeight(ta2, ta1));

    observer1.observe(ta1);
    observer2.observe(ta2);

    return () => {
      observer1.disconnect();
      observer2.disconnect();
    };
  }, [syncHeight]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-4">
          <TextareaWithAI
            ref={ref1}
            label="Comentarios y Observaciones"
            value={comments}
            onChange={onCommentsChange}
            placeholder="Escriba sus comentarios u observaciones aquí..."
            className="text-left font-mono text-sm resize-vertical"
            rows={5}
            style={{ lineHeight: '1.5' }}
            downloadFileName="comentarios-patente"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <TextareaWithAI
            ref={ref2}
            label="Próximas Acciones"
            value={nextActions}
            onChange={onNextActionsChange}
            placeholder="Escriba las próximas acciones aquí..."
            className="text-left font-mono text-sm resize-vertical"
            rows={5}
            style={{ lineHeight: '1.5' }}
            downloadFileName="proximas-acciones-patente"
          />
        </CardContent>
      </Card>
    </div>
  );
};
