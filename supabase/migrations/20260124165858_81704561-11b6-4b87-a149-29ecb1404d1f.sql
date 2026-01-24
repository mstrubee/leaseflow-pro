-- Enable RLS on cloud_storage_tokens table
ALTER TABLE public.cloud_storage_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can view cloud storage tokens
CREATE POLICY "Only admins can view cloud storage tokens"
ON public.cloud_storage_tokens
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert cloud storage tokens
CREATE POLICY "Only admins can insert cloud storage tokens"
ON public.cloud_storage_tokens
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update cloud storage tokens
CREATE POLICY "Only admins can update cloud storage tokens"
ON public.cloud_storage_tokens
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete cloud storage tokens
CREATE POLICY "Only admins can delete cloud storage tokens"
ON public.cloud_storage_tokens
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));