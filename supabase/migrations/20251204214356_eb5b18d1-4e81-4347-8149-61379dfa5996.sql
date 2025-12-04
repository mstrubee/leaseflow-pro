-- Crear enum para tipos de alerta
CREATE TYPE public.alert_type AS ENUM (
  'contract_expiration',
  'contract_renewal',
  'early_termination_notice',
  'inspection',
  'maintenance',
  'license',
  'permit',
  'certificate',
  'other'
);

-- Crear enum para canales de notificación
CREATE TYPE public.notification_channel AS ENUM ('email', 'whatsapp');

-- Crear tabla principal de alertas/recordatorios
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  item_id UUID, -- Para futuros elementos de infraestructura
  item_type TEXT, -- 'contract', 'license', 'permit', etc.
  alert_type alert_type NOT NULL DEFAULT 'contract_expiration',
  title TEXT NOT NULL,
  message TEXT,
  due_date DATE NOT NULL,
  channels notification_channel[] NOT NULL DEFAULT ARRAY['email']::notification_channel[],
  days_before INTEGER[] NOT NULL DEFAULT ARRAY[30, 15, 7, 1],
  repeat_every_days INTEGER, -- NULL = no repetir después de due_date
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  next_send_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de historial de alertas enviadas
CREATE TABLE public.alert_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  channel notification_channel NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'pending'
  error_message TEXT,
  days_before_due INTEGER
);

-- Crear tabla para configuración de destinatarios (admins por defecto)
CREATE TABLE public.alert_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;

-- Políticas para alerts
CREATE POLICY "Admins can manage all alerts"
ON public.alerts FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view alerts"
ON public.alerts FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create alerts"
ON public.alerts FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own alerts"
ON public.alerts FOR UPDATE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete own alerts"
ON public.alerts FOR DELETE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Políticas para alert_history
CREATE POLICY "Authenticated users can view alert history"
ON public.alert_history FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Políticas para alert_recipients
CREATE POLICY "Authenticated users can manage recipients"
ON public.alert_recipients FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Función para calcular next_send_at
CREATE OR REPLACE FUNCTION public.calculate_next_send_at(
  p_due_date DATE,
  p_days_before INTEGER[],
  p_repeat_every_days INTEGER,
  p_last_sent_at TIMESTAMP WITH TIME ZONE
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_date TIMESTAMP WITH TIME ZONE;
  v_day INTEGER;
  v_check_date DATE;
BEGIN
  -- Si la fecha ya pasó y hay repetición, calcular próxima fecha de repetición
  IF p_due_date < CURRENT_DATE AND p_repeat_every_days IS NOT NULL THEN
    IF p_last_sent_at IS NULL THEN
      RETURN now();
    END IF;
    RETURN p_last_sent_at + (p_repeat_every_days || ' days')::INTERVAL;
  END IF;
  
  -- Si la fecha ya pasó sin repetición, retornar NULL
  IF p_due_date < CURRENT_DATE THEN
    RETURN NULL;
  END IF;
  
  -- Buscar el próximo día de aviso
  FOREACH v_day IN ARRAY p_days_before
  LOOP
    v_check_date := p_due_date - (v_day || ' days')::INTERVAL;
    IF v_check_date >= CURRENT_DATE THEN
      IF v_next_date IS NULL OR v_check_date < v_next_date::DATE THEN
        v_next_date := v_check_date::TIMESTAMP WITH TIME ZONE;
      END IF;
    END IF;
  END LOOP;
  
  -- Si no hay próximo aviso programado antes de la fecha, usar la fecha misma
  IF v_next_date IS NULL AND p_due_date >= CURRENT_DATE THEN
    v_next_date := p_due_date::TIMESTAMP WITH TIME ZONE;
  END IF;
  
  RETURN v_next_date;
END;
$$;

-- Trigger para actualizar next_send_at automáticamente
CREATE OR REPLACE FUNCTION public.update_alert_next_send()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.next_send_at := calculate_next_send_at(
    NEW.due_date,
    NEW.days_before,
    NEW.repeat_every_days,
    NEW.last_sent_at
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_alert_next_send
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_alert_next_send();

-- Índices para mejorar rendimiento
CREATE INDEX idx_alerts_next_send_at ON public.alerts(next_send_at) WHERE is_active = true;
CREATE INDEX idx_alerts_contract_id ON public.alerts(contract_id);
CREATE INDEX idx_alert_history_alert_id ON public.alert_history(alert_id);
CREATE INDEX idx_alert_history_sent_at ON public.alert_history(sent_at);