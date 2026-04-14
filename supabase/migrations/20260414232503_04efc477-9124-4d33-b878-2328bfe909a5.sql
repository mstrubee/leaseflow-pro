CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH contract_data AS (
    SELECT
      c.id,
      c.name,
      c.status,
      c.requires_special_attention,
      c.comite_gp_status,
      COALESCE(ca.region, 'Sin región') AS region,
      COALESCE(ca.commune, 'Sin comuna') AS commune,
      array_agg(DISTINCT lower(comp.name)) FILTER (WHERE comp.name IS NOT NULL) AS company_names
    FROM contracts c
    LEFT JOIN LATERAL (
      SELECT region, commune FROM contract_addresses WHERE contract_id = c.id LIMIT 1
    ) ca ON true
    LEFT JOIN contract_companies cc ON cc.contract_id = c.id
    LEFT JOIN companies comp ON comp.id = cc.company_id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.name, c.status, c.requires_special_attention, c.comite_gp_status, ca.region, ca.commune
  ),
  totals AS (
    SELECT
      count(*) AS total_contracts,
      count(*) FILTER (WHERE status = 'firmado') AS total_vigentes,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%autoplanet%'
      )) AS total_vigentes_autoplanet,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%agroplanet%'
      )) AS total_vigentes_agroplanet,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%grupo planet%' OR cn LIKE '%grupoplanet%'
      )) AS total_vigentes_grupo_planet,
      count(*) FILTER (WHERE status = 'en_negociacion' AND COALESCE(comite_gp_status, '') != 'Rechazada') AS total_negociacion,
      count(*) FILTER (WHERE status = 'en_negociacion' AND comite_gp_status = 'Rechazada') AS total_rechazados,
      count(*) FILTER (WHERE status = 'vencido') AS total_vencidos,
      count(*) FILTER (WHERE status = 'firmado' AND requires_special_attention = true) AS total_atencion_especial
    FROM contract_data
  ),
  region_commune_stats AS (
    SELECT
      region,
      commune,
      count(*) AS total,
      count(*) FILTER (WHERE status = 'firmado') AS vigentes,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%autoplanet%'
      )) AS vigentes_autoplanet,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%agroplanet%'
      )) AS vigentes_agroplanet,
      count(*) FILTER (WHERE status = 'firmado' AND EXISTS (
        SELECT 1 FROM unnest(company_names) cn WHERE cn LIKE '%grupo planet%' OR cn LIKE '%grupoplanet%'
      )) AS vigentes_grupo_planet,
      count(*) FILTER (WHERE status = 'en_negociacion') AS negociacion,
      count(*) FILTER (WHERE status = 'vencido') AS vencidos
    FROM contract_data
    GROUP BY region, commune
  ),
  by_region AS (
    SELECT
      region,
      jsonb_build_object(
        'region', region,
        'total', sum(total),
        'vigentes', sum(vigentes),
        'vigentesAutoplanet', sum(vigentes_autoplanet),
        'vigentesAgroplanet', sum(vigentes_agroplanet),
        'vigentesGrupoPlanet', sum(vigentes_grupo_planet),
        'negociacion', sum(negociacion),
        'vencidos', sum(vencidos),
        'communes', jsonb_object_agg(commune, jsonb_build_object(
          'commune', commune,
          'total', total,
          'vigentes', vigentes,
          'vigentesAutoplanet', vigentes_autoplanet,
          'vigentesAgroplanet', vigentes_agroplanet,
          'vigentesGrupoPlanet', vigentes_grupo_planet,
          'negociacion', negociacion,
          'vencidos', vencidos
        ))
      ) AS region_data
    FROM region_commune_stats
    GROUP BY region
  )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t)::jsonb FROM totals t),
    'byRegion', COALESCE((SELECT jsonb_agg(region_data) FROM by_region), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;