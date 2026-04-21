import { useRef, useEffect } from "react";
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
  const userResized1 = useRef(false);
  const userResized2 = useRef(false);

  // Auto-fit each textarea independently to its own content on initial load.
  // Once the user manually resizes a textarea, we stop auto-adjusting it.
  useEffect(() => {
    const ta1 = ref1.current;
    if (!ta1 || userResized1.current) return;
    ta1.style.height = "auto";
    ta1.style.height = `${ta1.scrollHeight}px`;
  }, [comments]);

  useEffect(() => {
    const ta2 = ref2.current;
    if (!ta2 || userResized2.current) return;
    ta2.style.height = "auto";
    ta2.style.height = `${ta2.scrollHeight}px`;
  }, [nextActions]);

  // Detect manual resize (user drag) so we don't override their chosen height
  useEffect(() => {
    const ta1 = ref1.current;
    const ta2 = ref2.current;
    if (!ta1 || !ta2) return;

    let initialH1 = ta1.offsetHeight;
    let initialH2 = ta2.offsetHeight;

    const onMouseDown1 = () => { initialH1 = ta1.offsetHeight; };
    const onMouseUp1 = () => {
      if (ta1.offsetHeight !== initialH1) userResized1.current = true;
    };
    const onMouseDown2 = () => { initialH2 = ta2.offsetHeight; };
    const onMouseUp2 = () => {
      if (ta2.offsetHeight !== initialH2) userResized2.current = true;
    };

    ta1.addEventListener("mousedown", onMouseDown1);
    document.addEventListener("mouseup", onMouseUp1);
    ta2.addEventListener("mousedown", onMouseDown2);
    document.addEventListener("mouseup", onMouseUp2);

    return () => {
      ta1.removeEventListener("mousedown", onMouseDown1);
      document.removeEventListener("mouseup", onMouseUp1);
      ta2.removeEventListener("mousedown", onMouseDown2);
      document.removeEventListener("mouseup", onMouseUp2);
    };
  }, []);

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
            richText
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
            richText
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
