-- Add 'no_aplica' to patent_doc_status enum
ALTER TYPE patent_doc_status ADD VALUE IF NOT EXISTS 'no_aplica';