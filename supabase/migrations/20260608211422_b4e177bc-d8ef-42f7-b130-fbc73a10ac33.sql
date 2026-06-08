-- 1. Restore Data API grants on ALL public tables (currently missing globally)
DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND n.nspname = 'public'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
    END LOOP;
END;
$$;

-- 2. Recreate missing supplier_category_assignments table
CREATE TABLE IF NOT EXISTS public.supplier_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.supplier_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_category_assignments TO authenticated;
GRANT ALL ON public.supplier_category_assignments TO service_role;

ALTER TABLE public.supplier_category_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view category assignments"
  ON public.supplier_category_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert category assignments"
  ON public.supplier_category_assignments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update category assignments"
  ON public.supplier_category_assignments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete category assignments"
  ON public.supplier_category_assignments FOR DELETE
  TO authenticated USING (true);

-- 3. Backfill assignments from existing single-category data
INSERT INTO public.supplier_category_assignments (supplier_id, category_id)
SELECT id, category_id FROM public.suppliers
WHERE category_id IS NOT NULL
ON CONFLICT (supplier_id, category_id) DO NOTHING;