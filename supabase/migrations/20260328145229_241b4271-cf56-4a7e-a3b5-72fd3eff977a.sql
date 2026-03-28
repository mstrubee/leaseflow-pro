-- Insert the firmado document reference into the Final folder for Melipilla (2026)
INSERT INTO repository_files (folder_id, name, url, file_type, drive_file_id)
VALUES (
  'e3007d3b-29fa-462d-894c-a1282d974e29',
  '2026.01.12 Melipilla (2026) Firmado.pdf',
  'storage://repository-files/contracts/995e8573-92be-44b5-bc61-257282aa56a3/2026.01.12%20Melipilla%20(2026)%20Firmado.pdf',
  'pdf',
  NULL
)
ON CONFLICT DO NOTHING;