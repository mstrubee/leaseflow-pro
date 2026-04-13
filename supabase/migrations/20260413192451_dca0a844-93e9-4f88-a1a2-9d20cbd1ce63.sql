CREATE OR REPLACE FUNCTION public.backfill_patent_doc_names()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  url_parts TEXT[];
  single_url TEXT;
  file_id TEXT;
  file_name TEXT;
  all_names TEXT[];
  matches TEXT[];
BEGIN
  FOR rec IN
    SELECT id, document_url
    FROM patent_documents
    WHERE document_url IS NOT NULL AND document_url != ''
      AND (document_names IS NULL OR document_names = '')
  LOOP
    url_parts := string_to_array(rec.document_url, '|||');
    all_names := ARRAY[]::TEXT[];

    FOREACH single_url IN ARRAY url_parts
    LOOP
      IF single_url = '' THEN CONTINUE; END IF;

      matches := regexp_match(single_url, '/file/d/([^/]+)');
      IF matches IS NOT NULL AND array_length(matches, 1) > 0 THEN
        file_id := matches[1];
        
        SELECT rf.name INTO file_name
        FROM repository_files rf
        WHERE rf.drive_file_id = file_id
        LIMIT 1;

        IF file_name IS NOT NULL THEN
          all_names := array_append(all_names, file_name);
        ELSE
          all_names := array_append(all_names, 'archivo_' || file_id);
        END IF;
      ELSE
        all_names := array_append(all_names, 'archivo');
      END IF;
    END LOOP;

    IF array_length(all_names, 1) > 0 THEN
      UPDATE patent_documents
      SET document_names = array_to_string(all_names, '|||')
      WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;

SELECT public.backfill_patent_doc_names();

DROP FUNCTION public.backfill_patent_doc_names();