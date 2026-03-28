
-- Rename duplicate general_folders entries using street address as differentiator
-- AG - Chillan (Huambali) - first one keeps name
UPDATE general_folders SET name = 'AG - Chillan (Huambali)' WHERE id = '16a200a0-3153-4fb2-81e4-b644637cb55f';
UPDATE general_folders SET name = 'AG - Chillan (Av. Argentina)' WHERE id = '95214744-1eb8-4ee0-9963-ebafa7c217f1';
UPDATE general_folders SET name = 'AG - Chillan (Huambali 2)' WHERE id = 'f7531002-7b8b-4aa2-ba77-59b9fe97bd60';

-- AG - Osorno
UPDATE general_folders SET name = 'AG - Osorno (Eliodoro Vasquez)' WHERE id = '1fb9bbf9-fd76-441f-a16c-16c02d169d96';
UPDATE general_folders SET name = 'AG - Osorno (Manuel Bulnes)' WHERE id = '64df0771-142c-4b44-a4f9-c52428ec40b7';

-- AP - Las Condes
UPDATE general_folders SET name = 'AP - Las Condes (Av. Las Condes)' WHERE id = '19c25eac-c6b3-4dd4-b542-1c0a5bf61a09';
UPDATE general_folders SET name = 'AP - Las Condes 2' WHERE id = '8e0d4480-15c5-4811-9197-93d5b267f0a2';

-- Clear ALL drive_folder_id for contract subfolders since user deleted them from Drive
UPDATE general_folders SET drive_folder_id = NULL
WHERE parent_id = (SELECT id FROM general_folders WHERE is_contract_root = true LIMIT 1);
