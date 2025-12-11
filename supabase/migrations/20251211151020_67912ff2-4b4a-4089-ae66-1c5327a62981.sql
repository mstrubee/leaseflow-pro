-- Add column to track if an expired contract is still operating
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS is_expired_but_operating boolean DEFAULT false;

-- Add column to track storage provider for files
ALTER TABLE public.repository_files 
ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'local';

-- Add column to purchase_orders for storage provider
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'local';

-- Add column to invoices for storage provider
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'local';

-- Create table for storage provider settings
CREATE TABLE IF NOT EXISTS public.storage_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  active_provider text NOT NULL DEFAULT 'google_drive',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.storage_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for storage settings
CREATE POLICY "Admins can manage storage settings"
ON public.storage_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view storage settings"
ON public.storage_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default settings if not exists
INSERT INTO public.storage_settings (active_provider)
SELECT 'google_drive'
WHERE NOT EXISTS (SELECT 1 FROM public.storage_settings);

-- Create trigger for updated_at
CREATE TRIGGER update_storage_settings_updated_at
BEFORE UPDATE ON public.storage_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();