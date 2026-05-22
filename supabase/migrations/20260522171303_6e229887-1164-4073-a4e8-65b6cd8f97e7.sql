
DO $$
DECLARE
  r RECORD;
  pairs TEXT[][] := ARRAY[
    ['alert_recipients','Users can view alert_recipients with permission'],
    ['budget_carryover','Users can view budget_carryover with permission'],
    ['budget_lines','Users can view budget_lines with permission'],
    ['budget_reassignments','Users can view budget_reassignments with permission'],
    ['contract_addresses','Users can view contract_addresses with permission'],
    ['contract_budgets','Users can view contract_budgets with permission'],
    ['contract_companies','Users can view contract_companies with permission'],
    ['contract_contacts','Users can view contract_contacts with permission'],
    ['contract_documents','Users can view contract_documents with permission'],
    ['contract_import_audit','Users can view contract_import_audit with permission'],
    ['contract_patents','Users can view contract_patents with permission'],
    ['contract_versions','Users can view contract_versions with permission'],
    ['contracts','Users can view contracts with permission'],
    ['credit_notes','Users can view credit_notes with permission'],
    ['finalized_contracts','Users can view finalized_contracts with permission'],
    ['folder_statuses','Users can view folder_statuses with permission'],
    ['gantt_task_dependencies','Users can view gantt_task_dependencies with permission'],
    ['gantt_task_purchase_orders','Users can view gantt_task_purchase_orders with permission'],
    ['gantt_tasks','Users can view gantt_tasks with permission'],
    ['gantt_timelines','Users can view gantt_timelines with permission'],
    ['invoices','Users can view invoices with permission'],
    ['notice_ranges','Users can view notice_ranges with permission'],
    ['opex_master_budget','Users can view OPEX master budget with permission'],
    ['patent_document_alerts','Users can view patent_document_alerts with permission'],
    ['patent_documents','Users can view patent_documents with permission'],
    ['purchase_items','Users can view purchase_items with permission'],
    ['purchase_orders','Users can view purchase_orders with permission'],
    ['renegotiation_draft_escalations','Users can view draft escalations with permission'],
    ['renegotiation_draft_notice_ranges','Users can view draft notice ranges with permission'],
    ['renegotiation_drafts','Users can view renegotiation drafts with permission'],
    ['rent_escalations','Users can view rent_escalations with permission'],
    ['repository_files','Users can view repository_files with permission'],
    ['repository_folders','Users can view repository_folders with permission'],
    ['supplier_categories','Users can view supplier_categories with permission'],
    ['supplier_emails','Users can view supplier_emails with permission'],
    ['supplier_influence_zones','Users can view supplier influence zones'],
    ['supplier_products','Users can view supplier_products with permission'],
    ['suppliers','Users can view suppliers with permission'],
    ['termination_notices','Users can view termination_notices with permission'],
    ['version_notices','Users can view version_notices with contracts permission']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pairs[i][2], pairs[i][1]);
    EXECUTE format(
      'CREATE POLICY "Authenticated users can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      pairs[i][1]
    );
  END LOOP;
END $$;
