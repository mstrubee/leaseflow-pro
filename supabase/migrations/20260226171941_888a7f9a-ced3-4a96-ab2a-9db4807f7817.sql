UPDATE public.maintenance_forms
SET sub_status = 'clasificado',
    status = 'proceso',
    updated_at = now()
WHERE sub_status = 'solicitado'
  AND criticality_category_id IS NOT NULL
  AND deleted_at IS NULL;