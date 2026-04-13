UPDATE patent_documents
SET document_names = regexp_replace(
  document_names,
  '(\|\|\||^)(\d{13}_\d+_)',
  '\1',
  'g'
)
WHERE document_names ~ '\d{13}_\d+_'