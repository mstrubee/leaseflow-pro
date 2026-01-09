-- Add 'solicitado' to the patent_doc_status enum
ALTER TYPE patent_doc_status ADD VALUE IF NOT EXISTS 'solicitado' AFTER 'pendiente';