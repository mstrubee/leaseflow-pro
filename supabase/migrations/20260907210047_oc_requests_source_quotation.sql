-- Vincula una Solicitud de OC con el "Requerimiento de OC" (oc_quotations,
-- agrupadas por quotation_number) del que se originó al convertirla desde
-- la sección "OC Requeridas" en /contracts/:id > Órdenes de Compra.
ALTER TABLE public.oc_requests
  ADD COLUMN source_quotation_number TEXT NULL;

CREATE INDEX idx_oc_requests_source_quotation_number
  ON public.oc_requests (source_quotation_number)
  WHERE source_quotation_number IS NOT NULL;
