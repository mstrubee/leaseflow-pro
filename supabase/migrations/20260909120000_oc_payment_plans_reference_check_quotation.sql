-- La migración 20260907211549 agregó oc_payment_plans.quotation_number para
-- guardar el plan de pagos de un "Requerimiento de OC" (oc_quotations, antes
-- de que exista una oc_requests real), pero el CHECK original solo admitía
-- exactamente uno de purchase_order_id/oc_request_id no nulo -- una fila con
-- solo quotation_number (los otros dos en null) violaba la restricción y el
-- INSERT fallaba con "no se pudo guardar el plan de pagos".
ALTER TABLE public.oc_payment_plans
  DROP CONSTRAINT oc_payment_plans_reference_check;

ALTER TABLE public.oc_payment_plans
  ADD CONSTRAINT oc_payment_plans_reference_check CHECK (
    (purchase_order_id IS NOT NULL AND oc_request_id IS NULL AND quotation_number IS NULL) OR
    (purchase_order_id IS NULL AND oc_request_id IS NOT NULL AND quotation_number IS NULL) OR
    (purchase_order_id IS NULL AND oc_request_id IS NULL AND quotation_number IS NOT NULL)
  );
