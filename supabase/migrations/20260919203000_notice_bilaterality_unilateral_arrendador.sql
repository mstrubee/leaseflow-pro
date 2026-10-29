-- Agrega un tercer valor "unilateral_arrendador" a los campos de
-- bilateralidad de aviso de término anticipado (notice_bilaterality),
-- para cláusulas donde es el Arrendador quien puede poner término al
-- contrato unilateralmente (ej. aviso con X meses + indemnización, sin
-- que el arrendatario deba estar de acuerdo).
--
-- Alcance: SOLO notice_bilaterality (aviso principal y "Avisos
-- Múltiples"). No se toca auto_renewal_type ni el resto de columnas que
-- comparten el patrón unilateral_gp/bilateral (decisión explícita).
--
-- contract_versions.notice_bilaterality y
-- renegotiation_drafts.notice_bilaterality son TEXT sin CHECK, así que
-- ya aceptan cualquier valor de texto -- no requieren cambio de esquema.
-- version_notices.notice_bilaterality sí tiene un CHECK explícito
-- (definido sin nombre en su CREATE TABLE, por lo que Postgres lo nombró
-- version_notices_notice_bilaterality_check) que hay que reemplazar.

ALTER TABLE public.version_notices
  DROP CONSTRAINT IF EXISTS version_notices_notice_bilaterality_check;

ALTER TABLE public.version_notices
  ADD CONSTRAINT version_notices_notice_bilaterality_check
  CHECK (notice_bilaterality IN ('unilateral_gp', 'bilateral', 'unilateral_arrendador'));
