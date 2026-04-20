ALTER TABLE public.gantt_tasks
  ADD COLUMN responsible_member_id uuid
  REFERENCES public.org_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gantt_tasks_responsible_member
  ON public.gantt_tasks(responsible_member_id);

ALTER TABLE public.gantt_template_tasks
  ADD COLUMN default_responsible_member_id uuid
  REFERENCES public.org_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gantt_template_tasks_default_responsible
  ON public.gantt_template_tasks(default_responsible_member_id);