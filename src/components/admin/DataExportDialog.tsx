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
    tables: ["repository_files"],
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
      for (const table of mod.tables) {
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
