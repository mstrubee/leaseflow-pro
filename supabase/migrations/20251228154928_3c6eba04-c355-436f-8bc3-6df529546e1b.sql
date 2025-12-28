-- Create credit_notes table
CREATE TABLE public.credit_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  credit_note_number text NOT NULL,
  credit_note_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_uf numeric NOT NULL DEFAULT 0,
  amount_clp numeric DEFAULT 0,
  input_currency text DEFAULT 'UF'::text,
  uf_value_at_entry numeric DEFAULT 0,
  reason text,
  attachment_url text,
  drive_file_id text,
  storage_provider text DEFAULT 'local'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow all for authenticated users on credit_notes"
ON public.credit_notes
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Add budget_line_id to purchase_orders if not exists (for linking to budget lines)
-- This is already there based on schema, so skip

-- Create index for faster queries
CREATE INDEX idx_credit_notes_invoice_id ON public.credit_notes(invoice_id);
CREATE INDEX idx_credit_notes_purchase_order_id ON public.credit_notes(purchase_order_id);