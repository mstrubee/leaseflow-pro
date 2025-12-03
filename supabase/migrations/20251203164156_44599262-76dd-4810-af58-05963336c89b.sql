-- Add new status fields to contracts table
ALTER TABLE public.contracts 
ADD COLUMN operation_status text DEFAULT 'operando',
ADD COLUMN obra_status text DEFAULT 'terminada',
ADD COLUMN patente_status text DEFAULT 'sin_patente';

-- Add constraint for operation_status
ALTER TABLE public.contracts 
ADD CONSTRAINT contracts_operation_status_check 
CHECK (operation_status IN ('operando', 'cerrado'));

-- Add constraint for obra_status
ALTER TABLE public.contracts 
ADD CONSTRAINT contracts_obra_status_check 
CHECK (obra_status IN ('terminada', 'construccion', 'remodelacion', 'ampliacion'));

-- Add constraint for patente_status
ALTER TABLE public.contracts 
ADD CONSTRAINT contracts_patente_status_check 
CHECK (patente_status IN ('sin_patente', 'provisoria', 'definitiva'));