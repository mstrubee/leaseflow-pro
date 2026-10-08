import { useEffect } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useAutoplanetCase } from "@/hooks/useAutoplanetCase";
import { AutoplanetCaseEditor } from "@/components/autoplanet/AutoplanetCaseEditor";
import type { AutoplanetOutletContext } from "./AutoplanetLayout";

const AutoplanetCasePage = () => {
  const { caseId = "" } = useParams();
  const { hasPermission } = useAuth();
  const { setDirty } = useOutletContext<AutoplanetOutletContext>();
  const canEdit = hasPermission("autoplanet_servicios", "edit");
  const c = useAutoplanetCase(caseId);

  // Avisa al layout (sidebar) y al navegador cuando hay cambios sin guardar.
  useEffect(() => {
    setDirty(c.dirty);
    if (!c.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [c.dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const handleSave = async () => {
    try {
      await c.save();
      toast.success("Caso guardado");
    } catch {
      toast.error("No se pudo guardar el caso");
    }
  };

  const confirmBack = (e: React.MouseEvent) => {
    if (c.dirty && !window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) e.preventDefault();
  };

  if (c.loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (c.notFound || !c.inputs || !c.result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No se encontró el caso de negocio (o no tienes acceso).</p>
        <Link to="/autoplanet/casos-de-negocio" className="text-sm text-primary underline">Volver a Casos de negocio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/autoplanet/casos-de-negocio" onClick={confirmBack} className="text-muted-foreground hover:text-foreground" title="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Business Case Financiero</h1>
        <Input
          value={c.name}
          disabled={!canEdit}
          onChange={(e) => c.rename(e.target.value)}
          className="h-8 w-64 text-sm"
          aria-label="Nombre del caso"
        />
        <div className="ml-auto flex items-center gap-3">
          {c.saving && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>}
          {!c.saving && c.dirty && <span className="text-xs text-amber-600 inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Cambios sin guardar</span>}
          {!c.saving && !c.dirty && <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Guardado</span>}
          {canEdit && (
            <Button size="sm" className="h-8 gap-1" disabled={c.saving || !c.dirty} onClick={handleSave}>
              {c.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </Button>
          )}
        </div>
      </div>

      <AutoplanetCaseEditor
        inputs={c.inputs}
        result={c.result}
        readOnly={!canEdit}
        update={c.update}
        updateArr={c.updateArr}
        mutate={c.mutate}
        undo={c.undo}
      />
    </div>
  );
};

export default AutoplanetCasePage;
