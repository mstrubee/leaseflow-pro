import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2 } from "lucide-react";
import JSZip from "jszip";

const PAGE_SIZE = 1000;

// Special module that produces both per-table CSVs and a nested JSON for migration.
const GANTT_FULL_LABEL = "Cronogramas (completo)";

// Tables with restrictive RLS that must be read via the service-role Edge Function.
const ORG_EDGE_TABLES = ["org_members", "org_member_companies", "org_member_contracts"];

async function fetchOrgTablesViaEdge(): Promise<Record<string, Record<string, unknown>[]>> {
  const { data, error } = await supabase.functions.invoke("admin-export-org-members");
  if (error) {
    throw new Error(`Error consultando miembros de organización: ${error.message}`);
  }
  const tables = (data as { tables?: Record<string, Record<string, unknown>[]> })?.tables;
  if (!tables) {
    throw new Error("Respuesta inválida del servidor para miembros de organización.");
  }
  return tables;
}

interface ExportModule {
  label: string;
  tables: string[];
}

const EXPORT_MODULES: ExportModule[] = [
  {
    label: "Contratos",
    tables: [
      "contracts",
      "contract_versions",
      "contract_addresses",
      "contract_companies",
      "contract_contacts",
      "contract_budgets",
      "contract_documents",
      "notice_ranges",
      "termination_notices",
      "finalized_contracts",
      "contract_custom_fields",
      "contract_custom_field_values",
      "companies",
      "rent_escalations",
      "renegotiation_drafts",
    ],
  },
  {
    label: "Presupuestos",
    tables: [
      "budget_lines",
      "budget_templates",
      "budget_template_lines",
      "budget_carryover",
      "budget_reassignments",
      "budget_lines_audit",
    ],
  },
  {
    label: "Órdenes de Compra",
    tables: [
      "purchase_orders",
      "purchase_items",
      "purchase_order_budget_lines",
      "purchase_order_contract_allocations",
      "invoices",
      "credit_notes",
      "entry_expenses",
      "oc_requests",
      "oc_request_forms",
      "oc_request_templates",
      "oc_request_contract_allocations",
      "oc_budget_lines",
      "oc_payment_plans",
      "oc_quotations",
      "oc_import_batches",
    ],
  },
  {
    label: "Mantención",
    tables: [
      "maintenance_forms",
      "maintenance_locations",
      "maintenance_status_history",
      "maintenance_sub_statuses",
      "maintenance_criticality_categories",
      "maintenance_routes",
      "maintenance_route_forms",
      "maintenance_route_stops",
      "route_compliance_log",
    ],
  },
  {
    label: "Patentes",
    tables: [
      "contract_patents",
      "patent_documents",
      "patent_document_alerts",
      "patent_checklist_sections",
      "patent_checklist_items",
      "patent_custom_columns",
      "patent_emitters",
      "patent_item_emitters",
      "patent_statuses",
      "patent_shared_items",
      "patent_kpi_config",
    ],
  },
  {
    label: "KPI",
    tables: [
      "kpis",
      "kpi_measurements",
      "kpi_categories",
      "kpi_frequencies",
      "kpi_goal_types",
      "kpi_formula_versions",
      "kpi_empresa_entries",
      "kpi_audit_log",
    ],
  },
  {
    label: "Proveedores",
    tables: [
      "suppliers",
      "supplier_emails",
      "supplier_categories",
      "supplier_category_assignments",
      "supplier_opex_categories",
      "supplier_influence_zones",
      "supplier_products",
      "supplier_bank_details",
      "operator_suppliers",
    ],
  },
  {
    label: "Alertas",
    tables: [
      "alerts",
      "alert_categories",
      "alert_recipients",
      "alert_viewers",
      "alert_history",
    ],
  },
  {
    label: "Usuarios",
    tables: ["profiles", "user_roles", "user_permissions", "org_members", "user_preferences", "user_settings"],
  },
  {
    label: "Configuración",
    tables: ["app_settings", "holidays", "dashboard_sections", "folder_templates"],
  },
  {
    label: "OPEX",
    tables: ["opex_master_budget", "opex_categories"],
  },
  {
    label: "Gantt",
    tables: ["gantt_tasks", "gantt_timelines", "gantt_templates", "gantt_template_tasks"],
  },
  {
    label: "Presupuestos de contrato",
    tables: ["contract_budgets"],
  },
  {
    label: "Miembros de organización",
    tables: ["org_members", "org_member_companies", "org_member_contracts"],
  },
  {
    label: "Tareas plantilla Gantt",
    tables: ["gantt_template_tasks"],
  },
  {
    label: "Atención Especial",
    tables: ["special_attention_checklist", "special_attention_meetings"],
  },
  {
    label: "GeoLoc",
    tables: ["pois", "poi_folders"],
  },
  {
    label: "Repositorio",
    tables: ["repository_files", "repository_folders"],
  },
  {
    label: GANTT_FULL_LABEL,
    tables: [
      "gantt_timelines",
      "gantt_tasks",
      "gantt_task_dependencies",
      "gantt_task_purchase_orders",
      "gantt_templates",
      "gantt_template_tasks",
      "gantt_template_dependencies",
    ],
  },
];

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  return lines.join("\r\n");
}

async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;
  let to = PAGE_SIZE - 1;
  let done = false;

  while (!done) {
    const { data, error } = await (supabase as any).from(table).select("*").range(from, to);
    if (error) {
      throw new Error(`Error leyendo ${table}: ${error.message}`);
    }
    const rows = (data as any[] | null) || [];
    if (rows.length === 0) {
      done = true;
      break;
    }
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) {
      done = true;
    } else {
      from += PAGE_SIZE;
      to += PAGE_SIZE;
    }
  }

  return allRows;
}

// ---- Cronogramas (Gantt) full export: per-table CSVs + nested JSON ----

interface GanttTaskNode {
  id: string;
  name: string;
  parent_id: string | null;
  responsible: { id: string; name: string; position: string | null } | null;
  start_date?: string | null;
  duration_days?: number | null;
  duration_type?: string | null;
  end_date?: string | null;
  status?: string | null;
  progress?: number | null;
  color?: string | null;
  origin?: string | null;
  dependencies: {
    depends_on_task_id: string;
    depends_on_task_name: string | null;
    dep_type: string | null;
    lag_days: number | null;
    lag_type: string | null;
  }[];
  purchase_order_ids?: string[];
  children: GanttTaskNode[];
}

function buildTaskTree(
  rows: Record<string, any>[],
  toNode: (row: Record<string, any>) => GanttTaskNode,
): GanttTaskNode[] {
  const nodes = new Map<string, GanttTaskNode>();
  rows.forEach((r) => nodes.set(r.id, toNode(r)));
  const roots: GanttTaskNode[] = [];
  // Preserve display_order then name for stable ordering.
  const ordered = [...rows].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      String(a.name ?? "").localeCompare(String(b.name ?? "")),
  );
  for (const r of ordered) {
    const node = nodes.get(r.id)!;
    const parent = r.parent_id ? nodes.get(r.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function buildGanttFullExport(
  zip: JSZip,
  failed: string[],
): Promise<void> {
  const tables = [
    "gantt_timelines",
    "gantt_tasks",
    "gantt_task_dependencies",
    "gantt_task_purchase_orders",
    "gantt_templates",
    "gantt_template_tasks",
    "gantt_template_dependencies",
  ];

  const data: Record<string, Record<string, any>[]> = {};
  for (const table of tables) {
    try {
      const rows = await fetchAllRows(table);
      data[table] = rows;
      zip.file(`${table}.csv`, rowsToCsv(rows) || "\ufeff");
    } catch (e: any) {
      data[table] = [];
      failed.push(table);
      zip.file(`${table}_ERROR.txt`, e.message || String(e));
    }
  }

  // Org members (responsible) — basic, no PII, via RPC.
  let members: Record<string, { id: string; name: string; position: string | null }> = {};
  try {
    const { data: orgRows, error } = await (supabase as any).rpc("get_org_members_basic");
    if (error) throw error;
    const rows = (orgRows as any[] | null) || [];
    zip.file("org_members_basic.csv", rowsToCsv(rows) || "\ufeff");
    members = Object.fromEntries(
      rows.map((m: any) => [m.id, { id: m.id, name: m.name, position: m.position ?? null }]),
    );
  } catch (e: any) {
    failed.push("org_members_basic");
    zip.file("org_members_basic_ERROR.txt", e.message || String(e));
  }

  // Contract names for the JSON (CSV keeps contract_id).
  const contractNames: Record<string, string> = {};
  try {
    const rows = await fetchAllRows("contracts");
    rows.forEach((c: any) => {
      contractNames[c.id] = c.name;
    });
  } catch {
    // Non-fatal: JSON will just omit contract_name.
  }

  // Index dependencies and purchase orders by task.
  const depsByTask = new Map<string, Record<string, any>[]>();
  for (const d of data["gantt_task_dependencies"] || []) {
    const arr = depsByTask.get(d.task_id) || [];
    arr.push(d);
    depsByTask.set(d.task_id, arr);
  }
  const posByTask = new Map<string, string[]>();
  for (const p of data["gantt_task_purchase_orders"] || []) {
    const arr = posByTask.get(p.task_id) || [];
    arr.push(p.purchase_order_id);
    posByTask.set(p.task_id, arr);
  }
  const taskNames = new Map<string, string>();
  (data["gantt_tasks"] || []).forEach((t: any) => taskNames.set(t.id, t.name));

  const taskToNode = (t: any): GanttTaskNode => ({
    id: t.id,
    name: t.name,
    parent_id: t.parent_id ?? null,
    responsible: t.responsible_member_id ? members[t.responsible_member_id] ?? null : null,
    start_date: t.start_date ?? null,
    duration_days: t.duration_days ?? null,
    duration_type: t.duration_type ?? null,
    end_date: t.end_date ?? null,
    status: t.status ?? null,
    progress: t.progress ?? null,
    color: t.color ?? null,
    origin: t.origin ?? null,
    dependencies: (depsByTask.get(t.id) || []).map((d) => ({
      depends_on_task_id: d.depends_on_task_id,
      depends_on_task_name: taskNames.get(d.depends_on_task_id) ?? null,
      dep_type: d.dep_type ?? null,
      lag_days: d.lag_days ?? null,
      lag_type: d.lag_type ?? null,
    })),
    purchase_order_ids: posByTask.get(t.id) || [],
    children: [],
  });

  // Group real tasks by timeline.
  const tasksByTimeline = new Map<string, Record<string, any>[]>();
  for (const t of data["gantt_tasks"] || []) {
    const arr = tasksByTimeline.get(t.timeline_id) || [];
    arr.push(t);
    tasksByTimeline.set(t.timeline_id, arr);
  }

  const cronogramas = (data["gantt_timelines"] || []).map((tl: any) => ({
    timeline_id: tl.id,
    contract_id: tl.contract_id ?? null,
    contract_name: tl.contract_id ? contractNames[tl.contract_id] ?? null : null,
    name: tl.name,
    tasks: buildTaskTree(tasksByTimeline.get(tl.id) || [], taskToNode),
  }));

  // Templates (separate block).
  const tplDepsByTask = new Map<string, Record<string, any>[]>();
  for (const d of data["gantt_template_dependencies"] || []) {
    const arr = tplDepsByTask.get(d.task_id) || [];
    arr.push(d);
    tplDepsByTask.set(d.task_id, arr);
  }
  const tplTaskNames = new Map<string, string>();
  (data["gantt_template_tasks"] || []).forEach((t: any) => tplTaskNames.set(t.id, t.name));

  const tplTaskToNode = (t: any): GanttTaskNode => ({
    id: t.id,
    name: t.name,
    parent_id: t.parent_id ?? null,
    responsible: t.default_responsible_member_id
      ? members[t.default_responsible_member_id] ?? null
      : null,
    duration_days: t.default_duration_days ?? null,
    duration_type: t.duration_type ?? null,
    origin: t.default_origin ?? null,
    dependencies: (tplDepsByTask.get(t.id) || []).map((d) => ({
      depends_on_task_id: d.depends_on_task_id,
      depends_on_task_name: tplTaskNames.get(d.depends_on_task_id) ?? null,
      dep_type: d.dep_type ?? null,
      lag_days: d.lag_days ?? null,
      lag_type: d.lag_type ?? null,
    })),
    children: [],
  });

  const tplTasksByTemplate = new Map<string, Record<string, any>[]>();
  for (const t of data["gantt_template_tasks"] || []) {
    const arr = tplTasksByTemplate.get(t.template_id) || [];
    arr.push(t);
    tplTasksByTemplate.set(t.template_id, arr);
  }

  const templates = (data["gantt_templates"] || []).map((tpl: any) => ({
    template_id: tpl.id,
    name: tpl.name,
    description: tpl.description ?? null,
    is_active: tpl.is_active ?? null,
    tasks: buildTaskTree(tplTasksByTemplate.get(tpl.id) || [], tplTaskToNode),
  }));

  zip.file(
    "cronogramas.json",
    JSON.stringify({ exported_at: new Date().toISOString(), cronogramas, templates }, null, 2),
  );
}

export function DataExportDialog() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);

  if (!isAdmin) return null;

  const handleExport = async () => {
    if (!selectedModule) {
      toast({ variant: "destructive", title: "Selecciona un módulo" });
      return;
    }

    const mod = EXPORT_MODULES.find((m) => m.label === selectedModule);
    if (!mod) return;

    setExporting(true);
    const zip = new JSZip();
    const failed: string[] = [];

    try {
      // Org tables have restrictive RLS — fetch them in one go via the Edge Function.
      const orgTablesInModule = mod.tables.filter((t) => ORG_EDGE_TABLES.includes(t));
      let orgData: Record<string, Record<string, unknown>[]> = {};
      if (orgTablesInModule.length > 0) {
        try {
          orgData = await fetchOrgTablesViaEdge();
        } catch (e: any) {
          for (const table of orgTablesInModule) {
            failed.push(table);
            zip.file(`${table}_ERROR.txt`, e.message || String(e));
          }
        }
      }

      for (const table of mod.tables) {
        if (ORG_EDGE_TABLES.includes(table)) {
          if (orgData[table]) {
            const csv = rowsToCsv(orgData[table]);
            zip.file(`${table}.csv`, csv || "\ufeff");
          }
          continue;
        }
        try {
          const rows = await fetchAllRows(table);
          const csv = rowsToCsv(rows);
          zip.file(`${table}.csv`, csv || "\ufeff");
        } catch (e: any) {
          failed.push(table);
          zip.file(`${table}_ERROR.txt`, e.message || String(e));
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${selectedModule.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        title: "Exportación completa",
        description: failed.length
          ? `ZIP descargado. ${failed.length} tabla(s) con error: ${failed.join(", ")}`
          : "ZIP descargado correctamente.",
      });

      if (failed.length === 0) {
        setOpen(false);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error de exportación", description: e.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar datos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar datos</DialogTitle>
          <DialogDescription>
            Selecciona un módulo para descargar todas sus tablas en un archivo ZIP con CSVs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar módulo…" />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_MODULES.map((m) => (
                <SelectItem key={m.label} value={m.label}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleExport}
            disabled={exporting || !selectedModule}
            className="w-full gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exportando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
