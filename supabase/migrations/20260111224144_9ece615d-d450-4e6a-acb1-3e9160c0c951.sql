
-- =====================================================
-- OPEX/CAPEX BUDGET SEPARATION - DATA MODEL
-- =====================================================

-- 1. Create OPEX Categories table (editable by ADMIN)
CREATE TABLE public.opex_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.opex_categories ENABLE ROW LEVEL SECURITY;

-- Policies for opex_categories (read by all authenticated, write by admin only)
CREATE POLICY "Anyone can view active OPEX categories"
ON public.opex_categories FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage OPEX categories"
ON public.opex_categories FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- 2. Create Master OPEX Budget table (centralized, annual, by category)
CREATE TABLE public.opex_master_budget (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    year INTEGER NOT NULL,
    category_id UUID NOT NULL REFERENCES public.opex_categories(id) ON DELETE RESTRICT,
    amount_uf NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(year, category_id)
);

-- Enable RLS
ALTER TABLE public.opex_master_budget ENABLE ROW LEVEL SECURITY;

-- Policies for opex_master_budget
CREATE POLICY "Anyone can view OPEX master budget"
ON public.opex_master_budget FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage OPEX master budget"
ON public.opex_master_budget FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- 3. Create Local OPEX Additional Budget table (per contract, shown as "Additional")
CREATE TABLE public.opex_local_additional (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    category_id UUID NOT NULL REFERENCES public.opex_categories(id) ON DELETE RESTRICT,
    amount_uf NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(contract_id, year, category_id)
);

-- Enable RLS
ALTER TABLE public.opex_local_additional ENABLE ROW LEVEL SECURITY;

-- Policies for opex_local_additional
CREATE POLICY "Anyone can view OPEX local additional"
ON public.opex_local_additional FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage OPEX local additional"
ON public.opex_local_additional FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- 4. Create budget classification enum
CREATE TYPE public.budget_classification AS ENUM ('CAPEX', 'OPEX');

-- 5. Add columns to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS budget_classification public.budget_classification,
ADD COLUMN IF NOT EXISTS opex_category_id UUID REFERENCES public.opex_categories(id);

-- 6. Create indexes for performance
CREATE INDEX idx_opex_master_budget_year ON public.opex_master_budget(year);
CREATE INDEX idx_opex_master_budget_category ON public.opex_master_budget(category_id);
CREATE INDEX idx_opex_local_additional_contract ON public.opex_local_additional(contract_id);
CREATE INDEX idx_opex_local_additional_year ON public.opex_local_additional(year);
CREATE INDEX idx_purchase_orders_classification ON public.purchase_orders(budget_classification);
CREATE INDEX idx_purchase_orders_opex_category ON public.purchase_orders(opex_category_id);

-- 7. Create trigger for updated_at on new tables
CREATE TRIGGER update_opex_categories_updated_at
BEFORE UPDATE ON public.opex_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_opex_master_budget_updated_at
BEFORE UPDATE ON public.opex_master_budget
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_opex_local_additional_updated_at
BEFORE UPDATE ON public.opex_local_additional
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Insert default OPEX categories
INSERT INTO public.opex_categories (name, description, display_order) VALUES
('Climatización', 'Mantención de sistemas de aire acondicionado y climatización', 1),
('Cubiertas', 'Reparación y mantención de techos y cubiertas', 2),
('Eléctrico', 'Mantención de sistemas eléctricos', 3),
('Sanitario', 'Mantención de sistemas sanitarios y gasfitería', 4),
('Estructural', 'Reparaciones estructurales menores', 5),
('Pintura', 'Trabajos de pintura y terminaciones', 6),
('Seguridad', 'Sistemas de seguridad y control de acceso', 7),
('Otros', 'Otros gastos operativos', 99);
