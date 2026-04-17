ALTER TABLE public.gantt_tasks DROP CONSTRAINT IF EXISTS gantt_tasks_template_task_id_fkey;
ALTER TABLE public.gantt_tasks
  ADD CONSTRAINT gantt_tasks_template_task_id_fkey
  FOREIGN KEY (template_task_id)
  REFERENCES public.gantt_template_tasks(id)
  ON DELETE SET NULL;