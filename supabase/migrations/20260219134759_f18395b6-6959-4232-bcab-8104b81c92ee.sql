
-- 1. Create root shared folder
INSERT INTO public.repository_folders (id, contract_id, parent_id, name, is_base_folder, folder_type)
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', NULL, NULL, 'Documentación Legal', true, 'patent_shared_legal');

-- 2. Create subfolders
INSERT INTO public.repository_folders (id, contract_id, parent_id, name, is_base_folder, folder_type) VALUES
  ('b1000001-0000-0000-0000-000000000001', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Constitución de Sociedad', false, 'patent_shared_sub'),
  ('b1000001-0000-0000-0000-000000000002', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Vigencia de Sociedad', false, 'patent_shared_sub'),
  ('b1000001-0000-0000-0000-000000000003', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Poderes de Rep. Legal', false, 'patent_shared_sub'),
  ('b1000001-0000-0000-0000-000000000004', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Vigencia de Poderes', false, 'patent_shared_sub'),
  ('b1000001-0000-0000-0000-000000000005', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'RUT Empresa', false, 'patent_shared_sub'),
  ('b1000001-0000-0000-0000-000000000006', NULL, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'RUT Rep. Legal', false, 'patent_shared_sub');

-- 3. Create patent_shared_items table
CREATE TABLE public.patent_shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL UNIQUE REFERENCES public.patent_checklist_items(id) ON DELETE CASCADE,
  shared_folder_id uuid NOT NULL REFERENCES public.repository_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patent_shared_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read patent_shared_items"
  ON public.patent_shared_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage patent_shared_items"
  ON public.patent_shared_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Insert mappings for the 6 shared items (guardrail: skip if checklist_items not present yet)
DO $$
BEGIN
  INSERT INTO public.patent_shared_items (checklist_item_id, shared_folder_id) VALUES
    ('57bc2b0c-130f-4aff-906c-1ece6b789b68', 'b1000001-0000-0000-0000-000000000001'),
    ('668883c5-f009-4f63-b0cf-db2a5ebaefb8', 'b1000001-0000-0000-0000-000000000002'),
    ('edf51cd9-95f2-403d-9859-fd94779db9ea', 'b1000001-0000-0000-0000-000000000003'),
    ('06546bd0-c310-4ce8-874d-784bebef23ad', 'b1000001-0000-0000-0000-000000000004'),
    ('8fd7edbe-bed3-4f2a-8d04-95de0aa45638', 'b1000001-0000-0000-0000-000000000005'),
    ('ac7ba77d-39ad-4b5e-8477-729ace039dfe', 'b1000001-0000-0000-0000-000000000006');
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'Skipping patent_shared_items seed - checklist_items not present in empty DB';
END $$;

-- 5. RLS policy for shared repository folders (contract_id IS NULL)
CREATE POLICY "Authenticated users can read shared repository folders"
  ON public.repository_folders FOR SELECT TO authenticated
  USING (contract_id IS NULL);

CREATE POLICY "Admins can manage shared repository folders"
  ON public.repository_folders FOR ALL TO authenticated
  USING (contract_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (contract_id IS NULL AND public.has_role(auth.uid(), 'admin'));

-- 6. RLS for files in shared folders
CREATE POLICY "Authenticated users can read shared repository files"
  ON public.repository_files FOR SELECT TO authenticated
  USING (folder_id IN (SELECT id FROM public.repository_folders WHERE contract_id IS NULL));

CREATE POLICY "Authenticated users can manage shared repository files"
  ON public.repository_files FOR ALL TO authenticated
  USING (folder_id IN (SELECT id FROM public.repository_folders WHERE contract_id IS NULL))
  WITH CHECK (folder_id IN (SELECT id FROM public.repository_folders WHERE contract_id IS NULL));
