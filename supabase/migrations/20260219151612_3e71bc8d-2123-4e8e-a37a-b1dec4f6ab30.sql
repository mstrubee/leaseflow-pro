CREATE OR REPLACE FUNCTION public.get_folder_file_counts(p_folder_ids UUID[])
RETURNS TABLE(folder_id UUID, file_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rf.folder_id, COUNT(*)::BIGINT as file_count
  FROM repository_files rf
  WHERE rf.folder_id = ANY(p_folder_ids)
  GROUP BY rf.folder_id;
$$;