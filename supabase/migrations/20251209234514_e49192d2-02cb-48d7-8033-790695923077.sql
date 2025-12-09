-- Actualizar constraint de status en budget_lines
ALTER TABLE public.budget_lines DROP CONSTRAINT IF EXISTS budget_lines_status_check;
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_status_check CHECK (status IN ('autorizado', 'no_autorizado'));

-- Actualizar valores existentes
UPDATE public.budget_lines SET status = 'no_autorizado' WHERE status = 'pendiente';
UPDATE public.budget_lines SET status = 'autorizado' WHERE status = 'aprobado';