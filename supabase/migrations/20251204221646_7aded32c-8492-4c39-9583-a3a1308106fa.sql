-- Create alerts for existing signed contracts that don't have them yet
DO $$
DECLARE
  v_contract RECORD;
  v_version RECORD;
  v_expiration_date DATE;
  v_notice_date DATE;
BEGIN
  -- Loop through all signed contracts
  FOR v_contract IN 
    SELECT * FROM public.contracts 
    WHERE status = 'firmado' AND deleted_at IS NULL
  LOOP
    -- Get current version for the contract
    SELECT * INTO v_version 
    FROM public.contract_versions 
    WHERE contract_id = v_contract.id AND is_current = true
    LIMIT 1;
    
    IF v_version IS NOT NULL AND v_version.effective_date IS NOT NULL THEN
      -- Calculate expiration date
      v_expiration_date := v_version.effective_date + (v_version.duration_months || ' months')::INTERVAL;
      
      -- Create contract expiration alert if not exists
      INSERT INTO public.alerts (
        contract_id,
        title,
        message,
        alert_type,
        due_date,
        days_before,
        channels,
        is_active
      ) 
      SELECT 
        v_contract.id,
        'Vencimiento de contrato: ' || v_contract.name,
        'El contrato ' || v_contract.name || ' vencerá próximamente.',
        'contract_expiration',
        v_expiration_date,
        ARRAY[30, 15, 7, 1],
        ARRAY['email']::notification_channel[],
        true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.alerts 
        WHERE contract_id = v_contract.id 
        AND alert_type = 'contract_expiration'
        AND deleted_at IS NULL
      );
      
      -- Calculate early termination notice date based on notice_type
      IF v_version.notice_type = 'meses' THEN
        v_notice_date := v_expiration_date - (v_version.notice_value::INTEGER || ' months')::INTERVAL;
      ELSE
        v_notice_date := v_version.notice_value::DATE;
      END IF;
      
      -- Create early termination notice alert if not exists
      IF v_notice_date IS NOT NULL THEN
        INSERT INTO public.alerts (
          contract_id,
          title,
          message,
          alert_type,
          due_date,
          days_before,
          channels,
          is_active
        )
        SELECT
          v_contract.id,
          'Aviso de término anticipado: ' || v_contract.name,
          'Fecha límite para dar aviso de término anticipado del contrato ' || v_contract.name || '.',
          'early_termination_notice',
          v_notice_date,
          ARRAY[30, 15, 7, 1],
          ARRAY['email']::notification_channel[],
          true
        WHERE NOT EXISTS (
          SELECT 1 FROM public.alerts 
          WHERE contract_id = v_contract.id 
          AND alert_type = 'early_termination_notice'
          AND deleted_at IS NULL
        );
      END IF;
    END IF;
  END LOOP;
END $$;