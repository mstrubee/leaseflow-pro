import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import type { AdminConfig, InvLine, InvMethod } from "@/lib/businessCase/model";

export function BusinessCaseAdminConfig() {
  const { config, loading, saving, save } = useBusinessCaseAdminConfig();
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [cat, setCat] = useState<string>("");

  useEffect(() => {
    if (!loading) {
      setDraft(JSON.parse(JSON.stringify(config)));
      setCat((c) => c || config.categorias[0]);
    }
  }, [loading, config]);

  if (loading || !draft) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const update = (patch: Partial<AdminConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const setTipoDefault = (tipo: string, key: "margenDir" | "personalY1" | "anosDepr", value: number) => {
    setDraft((d) => {
      if (!d) return d;
      const defs = { ...d.defaultsPorTipo, [tipo]: { ...d.defaultsPorTipo[tipo], [key]: value } };
      return { ...d, defaultsPorTipo: defs };
    });
  };

  const setInvLine = (idx: number, patch: Partial<InvLine>) => {
    setDraft((d) => {
      if (!d) return d;
      const lines = [...(d.invLineas[cat] || [])];
      lines[idx] = { ...lines[idx], ...patch };
      return { ...d, invLineas: { ...d.invLineas, [cat]: lines } };
    });
  };
  const addInvLine = () => {
    setDraft((d) => {
      if (!d) return d;
      const lines = [...(d.invLineas[cat] || [])];
      lines.push({ id: `l${Date.now()}`, nombre: "Nueva línea", metodo: "total", valor: 0, activo: true, nota: "MM CLP" });
      return { ...d, invLineas: { ...d.invLineas, [cat]: lines } };
    });
  };
  const removeInvLine = (idx: number) => {
    setDraft((d) => {
      if (!d) return d;
      const lines = (d.invLineas[cat] || []).filter((_, i) => i !== idx);
      return { ...d, invLineas: { ...d.invLineas, [cat]: lines } };
    });
  };

  const setAprobador = (idx: number, patch: Partial<AdminConfig["aprobadores"][number]>) => {
    setDraft((d) => {
      if (!d) return d;
      const aps = [...d.aprobadores];
      aps[idx] = { ...aps[idx], ...patch };
      return { ...d, aprobadores: aps };
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await save(draft);
      toast.success("Configuración de Business Case guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const lines = draft.invLineas[cat] || [];

  return (
    <div className="space-y-6">
      {/* Organización */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Organización</h4>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div><Label className="text-xs">Nombre</Label>
            <Input value={draft.org.nombre} onChange={(e) => update({ org: { ...draft.org, nombre: e.target.value } })} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Siglas</Label>
            <Input value={draft.org.siglas} onChange={(e) => update({ org: { ...draft.org, siglas: e.target.value } })} className="h-8 text-sm" /></div>
        </div>
      </section>

      {/* Defaults por tipo de proyecto */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Valores por defecto por tipo de proyecto</h4>
        <div className="space-y-2">
          {draft.tiposProyecto.map((tipo) => {
            const d = draft.defaultsPorTipo[tipo] ?? { margenDir: 0, personalY1: 0, anosDepr: 1 };
            return (
              <div key={tipo} className="flex items-center gap-3 flex-wrap rounded-lg border p-2">
                <span className="text-sm font-medium w-28">{tipo}</span>
                <label className="text-xs flex items-center gap-1">Margen dir. %
                  <Input type="number" value={d.margenDir} onChange={(e) => setTipoDefault(tipo, "margenDir", Number(e.target.value))} className="h-7 w-20 text-sm" /></label>
                <label className="text-xs flex items-center gap-1">Personal Y1 (MM)
                  <Input type="number" value={d.personalY1} onChange={(e) => setTipoDefault(tipo, "personalY1", Number(e.target.value))} className="h-7 w-20 text-sm" /></label>
                <label className="text-xs flex items-center gap-1">Años depr.
                  <Input type="number" value={d.anosDepr} onChange={(e) => setTipoDefault(tipo, "anosDepr", Number(e.target.value))} className="h-7 w-16 text-sm" /></label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Líneas de inversión por categoría */}
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold">Líneas de inversión</h4>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-8 w-48 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {draft.categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1 ml-auto" onClick={addInvLine}>
            <Plus className="h-3.5 w-3.5" /> Agregar línea
          </Button>
        </div>
        <div className="space-y-1.5">
          {lines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 flex-wrap rounded border p-2">
              <input type="checkbox" checked={l.activo} onChange={(e) => setInvLine(i, { activo: e.target.checked })} title="Activa" />
              <Input value={l.nombre} onChange={(e) => setInvLine(i, { nombre: e.target.value })} className="h-7 text-sm w-44" placeholder="Nombre" />
              <Select value={l.metodo} onValueChange={(v) => setInvLine(i, { metodo: v as InvMethod })}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uf_m2">UF/m²</SelectItem>
                  <SelectItem value="total">Total (MM)</SelectItem>
                  <SelectItem value="auto">Auto (garantía)</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={l.valor} onChange={(e) => setInvLine(i, { valor: Number(e.target.value) })}
                className="h-7 text-sm w-24" title="UF/m² o MM CLP" disabled={l.metodo === "auto"} />
              <Input value={l.nota ?? ""} onChange={(e) => setInvLine(i, { nota: e.target.value })} className="h-7 text-xs flex-1 min-w-[8rem]" placeholder="Nota" />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeInvLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-xs text-muted-foreground">Sin líneas para esta categoría.</p>}
        </div>
      </section>

      {/* Aprobadores */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Flujo de aprobación</h4>
        <div className="space-y-1.5">
          {[...draft.aprobadores].sort((a, b) => a.orden - b.orden).map((ap) => {
            const idx = draft.aprobadores.findIndex((x) => x.id === ap.id);
            return (
              <div key={ap.id} className="flex items-center gap-3 rounded border p-2">
                <span className="text-xs text-muted-foreground w-6">{ap.orden}</span>
                <Input value={ap.rol} onChange={(e) => setAprobador(idx, { rol: e.target.value })} className="h-7 text-sm w-48" />
                <label className="text-xs flex items-center gap-1">
                  <input type="checkbox" checked={ap.requerido} onChange={(e) => setAprobador(idx, { requerido: e.target.checked })} />
                  Requerido
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar configuración
        </Button>
      </div>
    </div>
  );
}
