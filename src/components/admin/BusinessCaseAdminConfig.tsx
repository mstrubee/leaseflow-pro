import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import type { AdminConfig, InvLine, InvMethod } from "@/lib/businessCase/model";

export function BusinessCaseAdminConfig() {
  const { config, loading, saving, save } = useBusinessCaseAdminConfig();
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [cat, setCat] = useState<string>("");
  const [newEmpresa, setNewEmpresa] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    if (!loading) {
      setDraft(JSON.parse(JSON.stringify(config)));
      setCat((c) => c || config.categorias[0]);
    }
  }, [loading, config]);

  // Empresas existentes del Panel de Administración (tabla companies)
  useEffect(() => {
    supabase.from("companies").select("name").order("name", { ascending: true }).then(({ data }) => {
      setCompanies((data ?? []).map((c) => c.name).filter(Boolean));
    });
  }, []);

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

  const addEmpresa = () => {
    const nombre = newEmpresa.trim();
    if (!nombre) return;
    setDraft((d) => {
      if (!d) return d;
      if (d.tiposProyecto.some((t) => t.toLowerCase() === nombre.toLowerCase())) {
        toast.error("Esa empresa ya existe");
        return d;
      }
      return {
        ...d,
        tiposProyecto: [...d.tiposProyecto, nombre],
        defaultsPorTipo: { ...d.defaultsPorTipo, [nombre]: { margenDir: 50, personalY1: 10, anosDepr: 3 } },
      };
    });
    setNewEmpresa("");
  };

  const removeEmpresa = (tipo: string) => {
    setDraft((d) => {
      if (!d) return d;
      if (d.tiposProyecto.length <= 1) {
        toast.error("Debe existir al menos una empresa");
        return d;
      }
      const defs = { ...d.defaultsPorTipo };
      delete defs[tipo];
      return { ...d, tiposProyecto: d.tiposProyecto.filter((t) => t !== tipo), defaultsPorTipo: defs };
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
  const availableCompanies = companies.filter(
    (name) => !draft.tiposProyecto.some((t) => t.toLowerCase() === name.toLowerCase()),
  );

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

      {/* Empresas y valores por defecto */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Empresas</h4>
        <p className="text-xs text-muted-foreground">Cada empresa define los valores por defecto que se aplican a sus proyectos.</p>
        <div className="space-y-2">
          {draft.tiposProyecto.map((tipo) => {
            const d = draft.defaultsPorTipo[tipo] ?? { margenDir: 0, personalY1: 0, anosDepr: 1 };
            return (
              <div key={tipo} className="flex items-center gap-3 flex-wrap rounded-lg border p-2">
                <CompanyLogo companyName={tipo} size="sm" />
                <span className="text-sm font-medium w-28">{tipo}</span>
                <label className="text-xs flex items-center gap-1">Margen dir. %
                  <Input type="number" value={d.margenDir} onChange={(e) => setTipoDefault(tipo, "margenDir", Number(e.target.value))} className="h-7 w-20 text-sm" /></label>
                <label className="text-xs flex items-center gap-1">N° personas Y1
                  <Input type="number" value={d.personalY1} onChange={(e) => setTipoDefault(tipo, "personalY1", Number(e.target.value))} className="h-7 w-20 text-sm" /></label>
                <label className="text-xs flex items-center gap-1">Años depr.
                  <Input type="number" value={d.anosDepr} onChange={(e) => setTipoDefault(tipo, "anosDepr", Number(e.target.value))} className="h-7 w-16 text-sm" /></label>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 ml-auto" title="Eliminar empresa"
                  onClick={() => removeEmpresa(tipo)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Select value={newEmpresa} onValueChange={setNewEmpresa}>
            <SelectTrigger className="h-8 text-sm w-64"><SelectValue placeholder="Selecciona una empresa…" /></SelectTrigger>
            <SelectContent>
              {availableCompanies.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay más empresas por agregar</div>
              )}
              {availableCompanies.map((name) => (
                <SelectItem key={name} value={name}>
                  <span className="flex items-center gap-2"><CompanyLogo companyName={name} size="sm" /> {name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addEmpresa} disabled={!newEmpresa}>
            <Plus className="h-3.5 w-3.5" /> Agregar empresa
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Las empresas provienen de la sección «Empresas» del Panel de Administración.</p>
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar configuración
        </Button>
      </div>
    </div>
  );
}
