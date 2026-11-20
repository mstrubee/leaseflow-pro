-- Persist CAPEX/OPEX classification on OC requests.
-- Before this, the "+ Solicitud OC" dialog let the user pick CAPEX or OPEX but the choice
-- was never stored, so every request looked like OPEX and the later conversion to a
-- purchase order lost the classification.
-- Nullable on purpose: existing requests have no reliable classification and are left as NULL.
ALTER TABLE public.oc_requests
ADD COLUMN IF NOT EXISTS budget_classification public.budget_classification;

CREATE INDEX IF NOT EXISTS idx_oc_requests_classification
ON public.oc_requests(budget_classification)
WHERE budget_classification IS NOT NULL;
