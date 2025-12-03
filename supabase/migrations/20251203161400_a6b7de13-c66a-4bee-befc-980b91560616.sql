-- Add new document types for renegotiation
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'borrador_r';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'borrador_final_r';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'firmado_r';