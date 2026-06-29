import { supabase } from "@/integrations/supabase/client";

/**
 * Self-contained "complete" export of all Gantt schedules and templates as a
 * single JSON file, designed for re-importing into an external database
 * migration without ambiguity, missing data, or foreign-key errors.
 *
 * Rules:
 * - One unified JSON file (no CSVs).
 * - Tasks are kept FLAT (no nesting); hierarchy is expressed via parent_id.
 * - The `created_by` column is never included (avoids auth.users FK errors).
 * - Each timeline / template carries its own tasks and dependencies.
 */

const PAGE_SIZE = 1000;

type Row = Record<string, unknown>;

async function fetchAll(table: string): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Error leyendo ${table}: ${error.message}`);
    const rows = (data as Row[] | null) || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Pick the listed keys (in order), defaulting to null when absent. Never copies created_by. */
function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) out[k] = row[k] ?? null;
  return out;
}

const TIMELINE_FIELDS = [
  "id",
  "contract_id",
  "name",
  "template_id",
  "source",
  "is_priority",
  "created_at",
  "updated_at",
];

const TASK_FIELDS = [
  "id",
  "timeline_id",
  "parent_id",
  "template_task_id",
  "name",
  "start_date",
  "end_date",
  "duration_days",
  "duration_type",
  "status",
  "progress",
  "has_lag",
  "lag_days",
  "lag_type",
  "notes",
  "display_order",
  "color",
  "responsible_member_id",
  "origin",
  "created_at",
  "updated_at",
];

const DEPENDENCY_FIELDS = [
  "id",
  "task_id",
  "depends_on_task_id",
  "dep_type",
  "lag_days",
  "lag_type",
  "created_at",
];

const TEMPLATE_FIELDS = [
  "id",
  "name",
  "description",
  "is_active",
  "created_at",
  "updated_at",
];

const TEMPLATE_TASK_FIELDS = [
  "id",
  "template_id",
  "parent_id",
  "name",
  "default_duration_days",
  "duration_type",
  "display_order",
  "default_responsible_member_id",
  "default_origin",
  "created_at",
];

const TEMPLATE_DEP_FIELDS = [
  "id",
  "task_id",
  "depends_on_task_id",
  "dep_type",
  "lag_days",
  "lag_type",
  "created_at",
];

export interface GanttFullExport {
  exported_at: string;
  version: string;
  timelines: Row[];
  templates: Row[];
}

export async function buildGanttFullExport(): Promise<GanttFullExport> {
  const [
    timelines,
    tasks,
    deps,
    templates,
    tplTasks,
    tplDeps,
  ] = await Promise.all([
    fetchAll("gantt_timelines"),
    fetchAll("gantt_tasks"),
    fetchAll("gantt_task_dependencies"),
    fetchAll("gantt_templates"),
    fetchAll("gantt_template_tasks"),
    fetchAll("gantt_template_dependencies"),
  ]);

  // Map every task -> its timeline so dependencies can be grouped per timeline.
  const taskTimeline = new Map<string, string>();
  for (const t of tasks) taskTimeline.set(t.id as string, t.timeline_id as string);

  const tasksByTimeline = new Map<string, Row[]>();
  for (const t of tasks) {
    const arr = tasksByTimeline.get(t.timeline_id as string) || [];
    arr.push(pick(t, TASK_FIELDS));
    tasksByTimeline.set(t.timeline_id as string, arr);
  }

  const depsByTimeline = new Map<string, Row[]>();
  for (const d of deps) {
    const tlId = taskTimeline.get(d.task_id as string);
    if (!tlId) continue; // orphan dependency — skip to avoid dangling FK
    const arr = depsByTimeline.get(tlId) || [];
    arr.push(pick(d, DEPENDENCY_FIELDS));
    depsByTimeline.set(tlId, arr);
  }

  const sortByOrder = (a: Row, b: Row) =>
    ((a.display_order as number) ?? 0) - ((b.display_order as number) ?? 0);

  const timelinesOut = timelines.map((tl) => ({
    ...pick(tl, TIMELINE_FIELDS),
    tasks: (tasksByTimeline.get(tl.id as string) || []).sort(sortByOrder),
    dependencies: depsByTimeline.get(tl.id as string) || [],
  }));

  // Templates
  const tplTaskTemplate = new Map<string, string>();
  for (const t of tplTasks) tplTaskTemplate.set(t.id as string, t.template_id as string);

  const tplTasksByTemplate = new Map<string, Row[]>();
  for (const t of tplTasks) {
    const arr = tplTasksByTemplate.get(t.template_id as string) || [];
    arr.push(pick(t, TEMPLATE_TASK_FIELDS));
    tplTasksByTemplate.set(t.template_id as string, arr);
  }

  const tplDepsByTemplate = new Map<string, Row[]>();
  for (const d of tplDeps) {
    const tplId = tplTaskTemplate.get(d.task_id as string);
    if (!tplId) continue;
    const arr = tplDepsByTemplate.get(tplId) || [];
    arr.push(pick(d, TEMPLATE_DEP_FIELDS));
    tplDepsByTemplate.set(tplId, arr);
  }

  const templatesOut = templates.map((tpl) => ({
    ...pick(tpl, TEMPLATE_FIELDS),
    tasks: (tplTasksByTemplate.get(tpl.id as string) || []).sort(sortByOrder),
    dependencies: tplDepsByTemplate.get(tpl.id as string) || [],
  }));

  return {
    exported_at: new Date().toISOString(),
    version: "2",
    timelines: timelinesOut,
    templates: templatesOut,
  };
}

export async function downloadGanttFullExport(): Promise<void> {
  const payload = await buildGanttFullExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cronogramas_completo_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
