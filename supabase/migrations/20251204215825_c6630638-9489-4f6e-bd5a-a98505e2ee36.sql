-- Add completion/deletion tracking fields to alerts table
ALTER TABLE public.alerts 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_by UUID,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Create index for efficient queries on finalized alerts
CREATE INDEX IF NOT EXISTS idx_alerts_completed_at ON public.alerts(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_deleted_at ON public.alerts(deleted_at) WHERE deleted_at IS NOT NULL;

-- Function to auto-create alerts for new contracts
CREATE OR REPLACE FUNCTION public.create_contract_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_version RECORD;
  v_expiration_date DATE;
  v_notice_date DATE;
BEGIN
  -- Get current version for the contract
  SELECT * INTO v_version 
  FROM public.contract_versions 
  WHERE contract_id = NEW.id AND is_current = true
  LIMIT 1;
  
  IF v_version IS NOT NULL AND v_version.effective_date IS NOT NULL THEN
    -- Calculate expiration date
    v_expiration_date := v_version.effective_date + (v_version.duration_months || ' months')::INTERVAL;
    
    -- Create contract expiration alert
    INSERT INTO public.alerts (
      contract_id,
      title,
      message,
      alert_type,
      due_date,
      days_before,
      channels,
      is_active
    ) VALUES (
      NEW.id,
      'Vencimiento de contrato: ' || NEW.name,
      'El contrato ' || NEW.name || ' vencerá próximamente.',
      'contract_expiration',
      v_expiration_date,
      ARRAY[30, 15, 7, 1],
      ARRAY['email']::notification_channel[],
      true
    ) ON CONFLICT DO NOTHING;
    
    -- Calculate early termination notice date based on notice_type
    IF v_version.notice_type = 'meses' THEN
      v_notice_date := v_expiration_date - (v_version.notice_value::INTEGER || ' months')::INTERVAL;
    ELSE
      v_notice_date := v_version.notice_value::DATE;
    END IF;
    
    -- Create early termination notice alert
    IF v_notice_date IS NOT NULL AND v_notice_date > CURRENT_DATE THEN
      INSERT INTO public.alerts (
        contract_id,
        title,
        message,
        alert_type,
        due_date,
        days_before,
        channels,
        is_active
      ) VALUES (
        NEW.id,
        'Aviso de término anticipado: ' || NEW.name,
        'Fecha límite para dar aviso de término anticipado del contrato ' || NEW.name || '.',
        'early_termination_notice',
        v_notice_date,
        ARRAY[30, 15, 7, 1],
        ARRAY['email']::notification_channel[],
        true
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-create alerts when contract status changes to 'firmado'
DROP TRIGGER IF EXISTS trigger_create_contract_alerts ON public.contracts;
CREATE TRIGGER trigger_create_contract_alerts
  AFTER UPDATE ON public.contracts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'firmado')
  EXECUTE FUNCTION public.create_contract_alerts();