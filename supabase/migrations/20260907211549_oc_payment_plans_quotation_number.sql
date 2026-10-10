-- Permite guardar el plan de pagos de un "Requerimiento de OC" (oc_quotations,
-- agrupadas por quotation_number) antes de que exista una oc_requests real --
-- se transfiere al convertir el requerimiento en Solicitud de OC.
ALTER TABLE public.oc_payment_plans
  ADD COLUMN quotation_number TEXT NULL;

CREATE INDEX idx_oc_payment_plans_quotation_number
  ON public.oc_payment_plans (quotation_number)
  WHERE quotation_number IS NOT NULL;
