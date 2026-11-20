-- El módulo de rutas de mantención (useRouteBuilder.ts) ya tiene código para
-- vincular un punto del mapa (maintenance_locations) a un contrato vigente
-- -- clic derecho en un marcador ("Renombrar punto") o en el mapa ("Agregar
-- punto") -- pero la columna contract_id nunca se creó y la tabla solo tenía
-- política de SELECT, sin UPDATE/INSERT: el código detecta ambos casos y
-- reintenta sin contract_id o falla con "permisos insuficientes" (ver los
-- mensajes de error en renameLocation/createLocation), por eso la asociación
-- nunca quedaba realmente guardada.
ALTER TABLE public.maintenance_locations
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_locations_contract_id
  ON public.maintenance_locations (contract_id)
  WHERE contract_id IS NOT NULL;

DROP POLICY IF EXISTS "locations_update_admin" ON public.maintenance_locations;
CREATE POLICY "locations_update_admin"
  ON public.maintenance_locations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "locations_insert_admin" ON public.maintenance_locations;
CREATE POLICY "locations_insert_admin"
  ON public.maintenance_locations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
