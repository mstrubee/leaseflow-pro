
-- =============================================
-- Fix RLS policies for purchase_orders, invoices, credit_notes
-- Add 'purchase_orders' resource alongside 'budget'
-- =============================================

-- === PURCHASE_ORDERS ===

DROP POLICY "Users can view purchase_orders with permission" ON public.purchase_orders;
CREATE POLICY "Users can view purchase_orders with permission" ON public.purchase_orders
  FOR SELECT TO public
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'view') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can modify purchase_orders with permission" ON public.purchase_orders;
CREATE POLICY "Users can modify purchase_orders with permission" ON public.purchase_orders
  FOR INSERT TO public
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can update purchase_orders with permission" ON public.purchase_orders;
CREATE POLICY "Users can update purchase_orders with permission" ON public.purchase_orders
  FOR UPDATE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can delete purchase_orders with permission" ON public.purchase_orders;
CREATE POLICY "Users can delete purchase_orders with permission" ON public.purchase_orders
  FOR DELETE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

-- === INVOICES ===

DROP POLICY "Users can view invoices with permission" ON public.invoices;
CREATE POLICY "Users can view invoices with permission" ON public.invoices
  FOR SELECT TO public
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'view') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can modify invoices with permission" ON public.invoices;
CREATE POLICY "Users can modify invoices with permission" ON public.invoices
  FOR INSERT TO public
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can update invoices with permission" ON public.invoices;
CREATE POLICY "Users can update invoices with permission" ON public.invoices
  FOR UPDATE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can delete invoices with permission" ON public.invoices;
CREATE POLICY "Users can delete invoices with permission" ON public.invoices
  FOR DELETE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

-- === CREDIT_NOTES ===

DROP POLICY "Users can view credit_notes with permission" ON public.credit_notes;
CREATE POLICY "Users can view credit_notes with permission" ON public.credit_notes
  FOR SELECT TO public
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'view') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can modify credit_notes with permission" ON public.credit_notes;
CREATE POLICY "Users can modify credit_notes with permission" ON public.credit_notes
  FOR INSERT TO public
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can update credit_notes with permission" ON public.credit_notes;
CREATE POLICY "Users can update credit_notes with permission" ON public.credit_notes
  FOR UPDATE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );

DROP POLICY "Users can delete credit_notes with permission" ON public.credit_notes;
CREATE POLICY "Users can delete credit_notes with permission" ON public.credit_notes
  FOR DELETE TO public
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all') OR
    has_permission(auth.uid(), 'purchase_orders', 'edit') OR
    has_permission(auth.uid(), 'purchase_orders', 'all')
  );
