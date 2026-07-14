import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, CalendarClock, Loader2, ExternalLink, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useMaintenanceSubStatuses } from "@/hooks/useMaintenanceSubStatuses";
import { detectMaintenanceType, MaintenanceType } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ScheduledRow {
  taskId: string;
  taskName: string;
  startDate: string | null;
  endDate: string | null;
  formId: string;
  formNumber: string;
  supplierName: string | null;
  year: number | null;
  subStatus: string;
  type: MaintenanceType;
  criticalityId: string | null;
  contractId: string;
  contractName: string;
}

const ALL = "__all__";

/**
 * Vista global "Programaciones": todas las tareas de todos los cronogramas de
 * mantenciones (una fila por form ya programado, ver ScheduleMaintenanceDialog),
 * agrupadas por contrato y colapsadas por defecto. Los filtros ocultan
 * CONTRATOS enteros (no forms individuales dentro de un contrato que ya
 * calificó) — así un contrato con un form "Solicitado" y otro "Resuelto"
 * sigue mostrando ambos si el filtro de Sub Estado matchea cualquiera de los
 * dos, tal como se pidió explícitamente.
 */
export function MaintenanceSchedulesOverview({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { subStatusLabels } = useMaintenanceSubStatuses();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [criticalityMap, setCriticalityMap] = useState<Record<string, { name: string; color: string }>>({});
  const [zonalMap, setZonalMap] = useState<Record<string, string>>({});
  const [communeMap, setCommuneMap] = useState<Record<string, string>>({});
  const [companyMap, setCompanyMap] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [fContrato, setFContrato] = useState(ALL);
  const [fForm, setFForm] = useState("");
  const [fProveedor, setFProveedor] = useState(ALL);
  const [fAnio, setFAnio] = useState(ALL);
  const [fEmpresa, setFEmpresa] = useState(ALL);
  const [fSubEstado, setFSubEstado] = useState(ALL);
  const [fTipo, setFTipo] = useState(ALL);
  const [fComuna, setFComuna] = useState(ALL);
  const [fCriticidad, setFCriticidad] = useState(ALL);
  const [fZonal, setFZonal] = useState(ALL);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    (async () => {
      const [{ data: forms }, { data: criticalities }, { data: links }, { data: members }, { data: addresses }, { data: companies }] = await Promise.all([
        supabase
          .from("maintenance_forms")
          .select("id, form_number, contract_id, contract_name, supplier_name, year, sub_status, general_description, electrical_description, civil_description, hvac_description, fixed_assets_description, criticality_category_id, gantt_task_id")
          .is("deleted_at", null)
          .not("gantt_task_id", "is", null),
        supabase.from("maintenance_criticality_categories").select("id, name, color"),
        supabase.from("org_member_contracts").select("contract_id, org_member_id"),
        supabase.rpc("get_org_members_basic"),
        supabase.from("contract_addresses").select("contract_id, commune"),
        supabase
          .from("contract_companies")
          .select("contract_id, companies!inner(name)")
          .returns<Array<{ contract_id: string; companies: { name: string } }>>(),
      ]);

      const taskIds = Array.from(new Set((forms || []).map(f => f.gantt_task_id).filter((id): id is string => !!id)));
      const { data: tasks } = taskIds.length > 0
        ? await supabase.from("gantt_tasks").select("id, name, start_date, end_date").in("id", taskIds)
        : { data: [] as { id: string; name: string; start_date: string | null; end_date: string | null }[] };
      const taskById = new Map((tasks || []).map(t => [t.id, t]));

      const critMap: Record<string, { name: string; color: string }> = {};
      (criticalities || []).forEach((c: any) => { critMap[c.id] = { name: c.name, color: c.color }; });
      setCriticalityMap(critMap);

      const memberById: Record<string, { name: string; position: string }> = {};
      ((members as any[]) || []).forEach(m => { memberById[m.id] = { name: m.name, position: m.position }; });
      const zMap: Record<string, string> = {};
      (links || []).forEach((row: any) => {
        const m = memberById[row.org_member_id];
        if (m?.position?.toLowerCase().includes("zonal")) zMap[row.contract_id] = m.name;
      });
      setZonalMap(zMap);

      const cMap: Record<string, string> = {};
      (addresses || []).forEach((a: any) => { if (a.commune) cMap[a.contract_id] = a.commune; });
      setCommuneMap(cMap);

      const compMap: Record<string, string[]> = {};
      (companies || []).forEach(row => {
        const name = row.companies?.name;
        if (!name) return;
        if (!compMap[row.contract_id]) compMap[row.contract_id] = [];
        if (!compMap[row.contract_id].includes(name)) compMap[row.contract_id].push(name);
      });
      setCompanyMap(compMap);

      const built: ScheduledRow[] = (forms || [])
        .filter(f => f.gantt_task_id && taskById.has(f.gantt_task_id))
        .map(f => {
          const task = taskById.get(f.gantt_task_id!)!;
          return {
            taskId: task.id,
            taskName: task.name,
            startDate: task.start_date,
            endDate: task.end_date,
            formId: f.id,
            formNumber: f.form_number,
            supplierName: f.supplier_name,
            year: f.year,
            subStatus: f.sub_status,
            type: detectMaintenanceType(f as any),
            criticalityId: f.criticality_category_id,
            contractId: f.contract_id || "",
            contractName: f.contract_name || "Sin contrato",
          };
        });
      setRows(built);
      setLoaded(true);
      setLoading(false);
    })();
  }, [open, loaded]);

  // Grupos por contrato, ordenados alfabéticamente.
  const groups = useMemo(() => {
    const byContract = new Map<string, ScheduledRow[]>();
    rows.forEach(r => {
      const arr = byContract.get(r.contractId) || [];
      arr.push(r);
      byContract.set(r.contractId, arr);
    });
    return Array.from(byContract.entries())
      .map(([contractId, items]) => ({ contractId, contractName: items[0].contractName, items }))
      .sort((a, b) => a.contractName.localeCompare(b.contractName));
  }, [rows]);

  // Opciones de filtro, derivadas de los datos realmente presentes (no listas fijas).
  const options = useMemo(() => {
    const contratos = new Map<string, string>();
    const proveedores = new Set<string>();
    const anios = new Set<number>();
    const empresas = new Set<string>();
    const comunas = new Set<string>();
    rows.forEach(r => {
      contratos.set(r.contractId, r.contractName);
      if (r.supplierName) proveedores.add(r.supplierName);
      if (r.year) anios.add(r.year);
      (companyMap[r.contractId] || []).forEach(c => empresas.add(c));
      const commune = communeMap[r.contractId];
      if (commune) comunas.add(commune);
    });
    return {
      contratos: Array.from(contratos.entries()).sort((a, b) => a[1].localeCompare(b[1])),
      proveedores: Array.from(proveedores).sort(),
      anios: Array.from(anios).sort((a, b) => b - a),
      empresas: Array.from(empresas).sort(),
      comunas: Array.from(comunas).sort(),
      zonales: Array.from(new Set(Object.values(zonalMap))).sort(),
      criticidades: Object.entries(criticalityMap).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    };
  }, [rows, companyMap, communeMap, zonalMap, criticalityMap]);

  const activeFilterCount = [fContrato, fProveedor, fAnio, fEmpresa, fSubEstado, fTipo, fComuna, fCriticidad, fZonal]
    .filter(v => v !== ALL).length + (fForm.trim() ? 1 : 0);

  const clearFilters = () => {
    setFContrato(ALL); setFForm(""); setFProveedor(ALL); setFAnio(ALL); setFEmpresa(ALL);
    setFSubEstado(ALL); setFTipo(ALL); setFComuna(ALL); setFCriticidad(ALL); setFZonal(ALL);
  };

  // Un contrato se muestra si, para CADA filtro activo, existe AL MENOS UN
  // form del contrato que lo cumple — sin ocultar los demás forms del mismo
  // contrato que no lo cumplan (así lo pidió el usuario explícitamente).
  const visibleGroups = useMemo(() => {
    return groups.filter(g => {
      if (fContrato !== ALL && g.contractId !== fContrato) return false;
      const empresasGrupo = companyMap[g.contractId] || [];
      if (fEmpresa !== ALL && !empresasGrupo.includes(fEmpresa)) return false;
      if (fZonal !== ALL && zonalMap[g.contractId] !== fZonal) return false;
      if (fComuna !== ALL && communeMap[g.contractId] !== fComuna) return false;

      const formText = fForm.trim().toLowerCase();
      if (formText && !g.items.some(r => r.formNumber.toLowerCase().includes(formText))) return false;
      if (fProveedor !== ALL && !g.items.some(r => r.supplierName === fProveedor)) return false;
      if (fAnio !== ALL && !g.items.some(r => String(r.year) === fAnio)) return false;
      if (fSubEstado !== ALL && !g.items.some(r => r.subStatus === fSubEstado)) return false;
      if (fTipo !== ALL && !g.items.some(r => r.type === fTipo)) return false;
      if (fCriticidad !== ALL && !g.items.some(r => r.criticalityId === fCriticidad)) return false;

      return true;
    });
  }, [groups, fContrato, fEmpresa, fZonal, fComuna, fForm, fProveedor, fAnio, fSubEstado, fTipo, fCriticidad, companyMap, zonalMap, communeMap]);

  const toggle = (contractId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(contractId) ? next.delete(contractId) : next.add(contractId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-500" />
            Programaciones — Cronogramas de Mantenciones
          </DialogTitle>
          <DialogDescription>
            Todas las tareas ya programadas, agrupadas por contrato. Los filtros muestran contratos que tengan al menos un form que cumpla la condición, sin ocultar el resto de sus tareas.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pb-2 border-b">
          <Select value={fContrato} onValueChange={setFContrato}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Contrato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los contratos</SelectItem>
              {options.contratos.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={fForm}
            onChange={(e) => setFForm(e.target.value)}
            placeholder="N° Form..."
            className="h-8 text-xs"
          />
          <Select value={fProveedor} onValueChange={setFProveedor}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Proveedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los proveedores</SelectItem>
              {options.proveedores.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fAnio} onValueChange={setFAnio}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Año" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los años</SelectItem>
              {options.anios.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fEmpresa} onValueChange={setFEmpresa}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las empresas</SelectItem>
              {options.empresas.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSubEstado} onValueChange={setFSubEstado}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sub Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los sub estados</SelectItem>
              {Array.from(new Set(rows.map(r => r.subStatus))).map(s => (
                <SelectItem key={s} value={s}>{subStatusLabels[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los tipos</SelectItem>
              {(["Eléctrico", "Obra Civil", "Climatización", "Activos Fijos", "General", "Múltiple"] as MaintenanceType[]).map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fComuna} onValueChange={setFComuna}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Comuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las comunas</SelectItem>
              {options.comunas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCriticidad} onValueChange={setFCriticidad}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Criticidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las criticidades</SelectItem>
              {options.criticidades.map(([id, c]) => <SelectItem key={id} value={id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fZonal} onValueChange={setFZonal}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gerente Zonal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los gerentes zonales</SelectItem>
              {options.zonales.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
              <XCircle className="h-3.5 w-3.5" />
              Limpiar ({activeFilterCount})
            </Button>
          )}
        </div>

        {/* Listado agrupado por contrato */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {rows.length === 0 ? "Todavía no hay forms programados en ningún cronograma de mantenciones." : "Ningún contrato coincide con los filtros."}
            </p>
          ) : (
            <div className="space-y-1">
              {visibleGroups.map(g => {
                const isOpen = expanded.has(g.contractId);
                return (
                  <Collapsible key={g.contractId} open={isOpen} onOpenChange={() => toggle(g.contractId)}>
                    <div className="rounded-lg border">
                      <CollapsibleTrigger asChild>
                        <button type="button" className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-lg text-left">
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="font-medium text-sm truncate">{g.contractName}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{g.items.length} tarea{g.items.length === 1 ? "" : "s"}</Badge>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/contracts/${g.contractId}`, { state: { fromMaintenance: true } }); }}
                            className="text-muted-foreground hover:text-primary shrink-0"
                            title="Ver cronograma del contrato"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="divide-y border-t">
                          {g.items.map(r => {
                            const crit = r.criticalityId ? criticalityMap[r.criticalityId] : null;
                            return (
                              <div key={r.taskId} className="flex items-center gap-2 px-3 py-2 text-xs flex-wrap">
                                {crit && (
                                  <Badge
                                    className="text-[10px] shrink-0 border"
                                    style={{ backgroundColor: `${crit.color}22`, borderColor: crit.color, color: crit.color }}
                                  >
                                    {crit.name}
                                  </Badge>
                                )}
                                <span className="font-medium truncate min-w-[140px] flex-1">{r.taskName}</span>
                                <span className="text-muted-foreground shrink-0 flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  {r.startDate ? format(new Date(r.startDate + "T00:00:00"), "dd/MM") : "—"}
                                  {r.endDate && r.endDate !== r.startDate && ` → ${format(new Date(r.endDate + "T00:00:00"), "dd/MM")}`}
                                </span>
                                <Badge variant="secondary" className="text-[10px] shrink-0">FORM {r.formNumber}</Badge>
                                {r.supplierName && <span className="text-muted-foreground shrink-0 truncate max-w-[140px]">{r.supplierName}</span>}
                                <Badge variant="outline" className="text-[10px] shrink-0">{subStatusLabels[r.subStatus] || r.subStatus}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
