-- =============================================
-- SISTEMA DE CONTROL PRESUPUESTARIO Y COMPRAS
-- =============================================

-- 1. Agregar campos de superficies y presupuestos a contratos
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS superficie_terreno NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS superficie_edificada_local NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS superficie_showroom NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS superficie_bodega_backoffice NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS superficie_exterior_cubierto NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS superficie_exterior_descubierto NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS num_estacionamientos INTEGER DEFAULT 0;

-- 2. Tabla de presupuestos anuales por contrato
CREATE TABLE public.contract_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('inversion_inicial', 'capex')),
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  is_closed BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contract_id, year, budget_type)
);

-- 3. Tabla de líneas presupuestarias (jerárquica ilimitada)
CREATE TABLE public.budget_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.contract_budgets(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('aprobado', 'pendiente')),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Tabla de proveedores
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  rut TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Tabla de órdenes de compra
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  budget_id UUID REFERENCES public.contract_budgets(id) ON DELETE SET NULL,
  budget_line_id UUID REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  attachment_url TEXT,
  drive_file_id TEXT,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada', 'descuadrada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Tabla de facturas (asociadas a OC)
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  attachment_url TEXT,
  drive_file_id TEXT,
  reception_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (reception_status IN ('pendiente', 'recibido')),
  received_at TIMESTAMP WITH TIME ZONE,
  received_by UUID,
  email_sent_to TEXT,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Tabla de listado de compras (tipo Excel)
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  budget_id UUID REFERENCES public.contract_budgets(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  description TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  request_date DATE,
  delivery_date DATE,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  attachment_url TEXT,
  drive_file_id TEXT,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Tabla de reasignaciones anuales
CREATE TABLE public.budget_reassignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_budget_id UUID NOT NULL REFERENCES public.contract_budgets(id) ON DELETE CASCADE,
  target_budget_id UUID NOT NULL REFERENCES public.contract_budgets(id) ON DELETE CASCADE,
  budget_line_id UUID REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_item_id UUID REFERENCES public.purchase_items(id) ON DELETE SET NULL,
  amount_uf NUMERIC NOT NULL,
  notes TEXT,
  reassigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reassigned_by UUID
);

-- 9. Configuración de email por usuario (para recordar último email)
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  last_invoice_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 10. Habilitar RLS en todas las tablas
ALTER TABLE public.contract_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_reassignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 11. Políticas RLS para usuarios autenticados
CREATE POLICY "Allow all for authenticated users on contract_budgets" 
ON public.contract_budgets FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on budget_lines" 
ON public.budget_lines FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on suppliers" 
ON public.suppliers FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on purchase_orders" 
ON public.purchase_orders FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on invoices" 
ON public.invoices FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on purchase_items" 
ON public.purchase_items FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on budget_reassignments" 
ON public.budget_reassignments FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage own settings" 
ON public.user_settings FOR ALL 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- 12. Trigger para actualizar updated_at
CREATE TRIGGER update_contract_budgets_updated_at
BEFORE UPDATE ON public.contract_budgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_lines_updated_at
BEFORE UPDATE ON public.budget_lines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_items_updated_at
BEFORE UPDATE ON public.purchase_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Función para calcular estado de OC
CREATE OR REPLACE FUNCTION public.update_purchase_order_status()
RETURNS TRIGGER AS $$
DECLARE
  total_invoiced NUMERIC;
  order_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount_uf), 0) INTO total_invoiced
  FROM public.invoices
  WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  SELECT amount_uf INTO order_amount
  FROM public.purchase_orders
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  UPDATE public.purchase_orders
  SET status = CASE
    WHEN total_invoiced > order_amount THEN 'descuadrada'
    WHEN total_invoiced = order_amount THEN 'cerrada'
    ELSE 'abierta'
  END
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_po_status_on_invoice_change
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_purchase_order_status();

-- 14. Índices para mejor rendimiento
CREATE INDEX idx_contract_budgets_contract_year ON public.contract_budgets(contract_id, year);
CREATE INDEX idx_budget_lines_budget ON public.budget_lines(budget_id);
CREATE INDEX idx_budget_lines_parent ON public.budget_lines(parent_id);
CREATE INDEX idx_purchase_orders_contract ON public.purchase_orders(contract_id);
CREATE INDEX idx_purchase_orders_year ON public.purchase_orders(year);
CREATE INDEX idx_invoices_po ON public.invoices(purchase_order_id);
CREATE INDEX idx_purchase_items_contract ON public.purchase_items(contract_id);
CREATE INDEX idx_purchase_items_year ON public.purchase_items(year);