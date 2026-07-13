import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PermLevel = "none" | "view" | "edit";

export type PermissionsMap = Record<string, PermLevel>;

interface TreeNode {
  id: string;
  label: string;
  resource: string;
  children?: TreeNode[];
}

// Full navigation tree — matches the app's route/section structure
export const PERMISSION_TREE: TreeNode[] = [
  {
    id: "dashboard_group",
    label: "Dashboard",
    resource: "dashboard",
    children: [
      { id: "dashboard_stats", label: "Estadísticas de Contratos", resource: "dashboard_stats" },
      { id: "dashboard_map", label: "Mapa Interactivo", resource: "dashboard_map" },
      { id: "dashboard_economic", label: "Indicadores Económicos", resource: "dashboard_economic" },
      { id: "dashboard_patents", label: "Patentes (Dashboard)", resource: "dashboard_patents" },
    ],
  },
  {
    id: "contracts_group",
    label: "Contratos",
    resource: "contracts",
    children: [
      { id: "contract_address", label: "Dirección y Ubicación", resource: "contract_address" },
      { id: "contract_contact", label: "Contacto", resource: "contract_contact" },
      { id: "contract_commercial", label: "Condiciones Comerciales", resource: "contract_commercial" },
      { id: "contract_surfaces", label: "Superficies y Datos", resource: "contract_surfaces" },
      { id: "contract_documents", label: "Contrato de Arriendo", resource: "contract_documents" },
      { id: "contract_repository", label: "Repositorio de Documentos", resource: "contract_repository" },
      {
        id: "contract_budget",
        label: "Control Presupuestario",
        resource: "contract_budget",
        children: [
          { id: "budget_ver_resumen",       label: "Ver resumen ejecutivo",               resource: "budget_ver_resumen" },
          { id: "budget_editar_lineas",     label: "Agregar y eliminar líneas",           resource: "budget_editar_lineas" },
          { id: "budget_editar_cantidades", label: "Editar cantidades",                   resource: "budget_editar_cantidades" },
          { id: "budget_editar_montos",     label: "Editar montos y precio unitario",     resource: "budget_editar_montos" },
          { id: "budget_editar_estado",     label: "Editar Estado de Avance (badge)",     resource: "budget_editar_estado" },
          { id: "budget_autorizar",         label: "Autorizar / desautorizar líneas",     resource: "budget_autorizar" },
          { id: "budget_aprobar_gastos",    label: "Aprobar / autorizar gastos",          resource: "budget_aprobar_gastos" },
          { id: "budget_ordenes_compra",    label: "Gestionar órdenes de compra",         resource: "budget_ordenes_compra" },
          { id: "budget_exportar",          label: "Exportar reportes",                   resource: "budget_exportar" },
        ],
      },
      {
        id: "contract_gantt",
        label: "Cronogramas",
        resource: "contract_gantt",
        children: [
          { id: "gantt_ver_linea",      label: "Ver línea de tiempo",         resource: "gantt_ver_linea" },
          { id: "gantt_editar_tareas",  label: "Editar tareas existentes",    resource: "gantt_editar_tareas" },
          { id: "gantt_agregar_tareas", label: "Agregar nuevas tareas",       resource: "gantt_agregar_tareas" },
          { id: "gantt_eliminar_tareas",label: "Eliminar tareas",             resource: "gantt_eliminar_tareas" },
          { id: "gantt_dependencias",   label: "Gestionar dependencias",      resource: "gantt_dependencias" },
        ],
      },
      { id: "contract_alerts", label: "Alertas y Recordatorios", resource: "contract_alerts" },
      { id: "contract_patents", label: "Patentes", resource: "contract_patents" },
    ],
  },
  { id: "purchase_orders", label: "Órdenes de Compra", resource: "purchase_orders" },
  { id: "capex", label: "CAPEX", resource: "capex" },
  { id: "opex", label: "OPEX", resource: "opex" },
  { id: "suppliers", label: "Proveedores", resource: "suppliers" },
  {
    id: "maintenance",
    label: "Mantención",
    resource: "maintenance",
    children: [
      { id: "maintenance_formularios",      label: "Ver y gestionar formularios",        resource: "maintenance_formularios" },
      { id: "maintenance_rutas",            label: "Ver calendario de rutas",            resource: "maintenance_rutas" },
      { id: "maintenance_ejecutar_rutas",   label: "Ejecutar rutas en terreno",          resource: "maintenance_ejecutar_rutas" },
      { id: "maintenance_armar_rutas",      label: "Armar y editar rutas",               resource: "maintenance_armar_rutas" },
      { id: "maintenance_cumplimiento",     label: "Ver estadísticas de cumplimiento",   resource: "maintenance_cumplimiento" },
      { id: "maintenance_categorias",       label: "Gestionar categorías y criticidad",  resource: "maintenance_categorias" },
    ],
  },
  { id: "repository", label: "Repositorio General", resource: "repository" },
  { id: "alerts", label: "Alertas", resource: "alerts" },
  {
    id: "reports",
    label: "Informes",
    resource: "reports",
    children: [
      { id: "report_patents", label: "Estado general de Patentes", resource: "patents" },
      { id: "report_suppliers", label: "Informe de Proveedores", resource: "suppliers" },
      { id: "report_gantt", label: "Cartas Gantt — Vista General", resource: "capex" },
      { id: "report_maintenance", label: "Informe de Mantenciones", resource: "maintenance" },
    ],
  },
  {
    id: "kpi",
    label: "KPIs",
    resource: "kpi",
    children: [
      { id: "kpi_cobertura_proveedores", label: "Cobertura de Proveedores", resource: "kpi_cobertura_proveedores" },
      { id: "kpi_resolucion_forms",      label: "Resolución de Forms",      resource: "kpi_resolucion_forms" },
      { id: "kpi_oc_facturas",           label: "OC y Facturas al Día",     resource: "kpi_oc_facturas" },
    ],
  },
  { id: "patents", label: "Patentes", resource: "patents" },
  { id: "special_attention", label: "Atención Especial", resource: "special_attention" },
  { id: "geoloc", label: "Geolocalización", resource: "geoloc" },
];

// Collect all leaf resource keys from the tree
export function getAllResources(nodes: TreeNode[] = PERMISSION_TREE): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.resource);
    if (node.children?.length) {
      result.push(...getAllResources(node.children));
    }
  }
  return result;
}

function cyclePermission(current: PermLevel): PermLevel {
  if (current === "none") return "view";
  if (current === "view") return "edit";
  return "none";
}

const PERM_CONFIG: Record<PermLevel, { bg: string; border: string; dot: string; label: string }> = {
  none: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", dot: "bg-red-500", label: "Sin acceso" },
  view: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-400", label: "Ver" },
  edit: { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", dot: "bg-green-500", label: "Editar" },
};

function collectAllResources(node: TreeNode): string[] {
  const result = [node.resource];
  for (const child of node.children ?? []) result.push(...collectAllResources(child));
  return result;
}

function deriveGroupPerm(node: TreeNode, perms: PermissionsMap): PermLevel | "mixed" {
  const all = collectAllResources(node);
  const levels = all.map(r => perms[r] ?? "none");
  const unique = new Set(levels);
  if (unique.size === 1) return [...unique][0] as PermLevel;
  return "mixed";
}

function setGroupPerms(node: TreeNode, level: PermLevel, perms: PermissionsMap): PermissionsMap {
  const next = { ...perms };
  for (const r of collectAllResources(node)) next[r] = level;
  return next;
}

interface PermBadgeProps {
  level: PermLevel | "mixed";
  onClick?: () => void;
  readOnly?: boolean;
}

function PermBadge({ level, onClick, readOnly }: PermBadgeProps) {
  const cfg = level === "mixed"
    ? { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", dot: "bg-purple-400", label: "Mixto" }
    : PERM_CONFIG[level];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all",
        cfg.bg, cfg.border,
        !readOnly && "hover:scale-105 cursor-pointer",
        readOnly && "cursor-default opacity-80",
      )}
      title={readOnly ? cfg.label : `Click para cambiar — actual: ${cfg.label}`}
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </button>
  );
}

interface TreeNodeRowProps {
  node: TreeNode;
  perms: PermissionsMap;
  onChange: (perms: PermissionsMap) => void;
  depth: number;
  readOnly: boolean;
  searchActive: boolean;
  matchedResources: Set<string>;
}

function TreeNodeRow({ node, perms, onChange, depth, readOnly, searchActive, matchedResources }: TreeNodeRowProps) {
  const hasChildren = !!node.children?.length;
  const [open, setOpen] = useState(false);

  const isMatch = !searchActive ||
    collectAllResources(node).some(r => matchedResources.has(r));

  if (searchActive && !isMatch) return null;

  const groupLevel = hasChildren ? deriveGroupPerm(node, perms) : (perms[node.resource] ?? "none");
  const effectiveOpen = searchActive ? true : open;

  function handleTogglePerm() {
    if (readOnly) return;
    if (hasChildren) {
      const currentEff = groupLevel === "mixed" ? "edit" : groupLevel as PermLevel;
      const next = cyclePermission(currentEff);
      onChange(setGroupPerms(node, next, perms));
    } else {
      const next = cyclePermission(perms[node.resource] ?? "none");
      onChange({ ...perms, [node.resource]: next });
    }
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center justify-between py-2 px-3 rounded-lg mb-0.5 group",
          depth === 0 ? "bg-muted/60 font-medium" : "hover:bg-muted/40",
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(o => !o)}
            >
              {effectiveOpen
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className={cn("text-sm truncate", depth === 0 && "text-foreground")}>
            {node.label}
          </span>
          {hasChildren && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({node.children!.length + 1} secciones)
            </span>
          )}
        </div>
        <div className="shrink-0 ml-2">
          <PermBadge
            level={groupLevel}
            onClick={handleTogglePerm}
            readOnly={readOnly}
          />
        </div>
      </div>

      {effectiveOpen && hasChildren && (
        <div>
          {/* Parent resource row */}
          <div
            className="flex items-center justify-between py-1.5 px-3 rounded-lg mb-0.5 hover:bg-muted/40"
            style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm truncate text-muted-foreground">
                {node.label} — acceso general
              </span>
            </div>
            <PermBadge
              level={perms[node.resource] ?? "none"}
              onClick={() => {
                if (readOnly) return;
                const next = cyclePermission(perms[node.resource] ?? "none");
                onChange({ ...perms, [node.resource]: next });
              }}
              readOnly={readOnly}
            />
          </div>
          {/* Children */}
          {node.children!.map(child => (
            <TreeNodeRow
              key={child.id}
              node={child}
              perms={perms}
              onChange={onChange}
              depth={depth + 1}
              readOnly={readOnly}
              searchActive={searchActive}
              matchedResources={matchedResources}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PermissionTreeEditorProps {
  permissions: PermissionsMap;
  onChange?: (perms: PermissionsMap) => void;
  readOnly?: boolean;
}

export function PermissionTreeEditor({ permissions, onChange, readOnly = false }: PermissionTreeEditorProps) {
  const [search, setSearch] = useState("");

  const matchedResources = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const q = search.toLowerCase();
    const matched = new Set<string>();
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q) || n.resource.toLowerCase().includes(q)) {
          matched.add(n.resource);
        }
        if (n.children) walk(n.children);
      }
    }
    walk(PERMISSION_TREE);
    return matched;
  }, [search]);

  const searchActive = search.trim().length > 0;

  function handleAllPerm(level: PermLevel) {
    if (readOnly || !onChange) return;
    const all = getAllResources();
    const next: PermissionsMap = {};
    all.forEach(r => { next[r] = level; });
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Legend + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar sección..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleAllPerm("none")}
              className="px-2 py-1 text-xs rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              Todo: Sin acceso
            </button>
            <button
              type="button"
              onClick={() => handleAllPerm("view")}
              className="px-2 py-1 text-xs rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              Todo: Ver
            </button>
            <button
              type="button"
              onClick={() => handleAllPerm("edit")}
              className="px-2 py-1 text-xs rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              Todo: Editar
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Sin acceso</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Solo ver</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Ver y editar</span>
        {!readOnly && <span className="ml-2 text-muted-foreground italic">Click en el badge para cambiar el permiso</span>}
      </div>

      {/* Tree */}
      <div className="rounded-lg border bg-background overflow-auto max-h-[55vh]">
        <div className="p-2">
          {PERMISSION_TREE.map(node => (
            <TreeNodeRow
              key={node.id}
              node={node}
              perms={permissions}
              onChange={onChange ?? (() => {})}
              depth={0}
              readOnly={readOnly}
              searchActive={searchActive}
              matchedResources={matchedResources}
            />
          ))}
          {searchActive && matchedResources.size === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se encontraron secciones con "{search}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
