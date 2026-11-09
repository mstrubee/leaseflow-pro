-- Migration: support multiple gantt timelines per contract
-- Adds is_priority flag to gantt_timelines
-- The "Prioritario" timeline is the main reference; all others are "Estudio"

ALTER TABLE public.gantt_timelines
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT false;

-- Retroactively mark the earliest timeline per contract as priority
UPDATE public.gantt_timelines t1
SET is_priority = true
WHERE t1.id = (
  SELECT t2.id
  FROM public.gantt_timelines t2
  WHERE t2.contract_id = t1.contract_id
  ORDER BY t2.created_at ASC
  LIMIT 1
);
