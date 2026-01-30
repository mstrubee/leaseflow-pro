import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RenegotiationDraft {
  id: string;
  contract_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  
  // Commercial conditions
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
  effective_date: string | null;
  effective_from_signature: boolean;
  
  // Additional fields
  guarantee_multiplier: number | null;
  has_periodic_adjustments: boolean;
  first_adjustment_month: number | null;
  adjustment_periodicity_months: number | null;
  adjustment_type: string | null;
  adjustment_value: number | null;
  
  // Gastos comunes
  gastos_comunes_methodology: string;
  gastos_comunes_uf_m2: number | null;
  gastos_comunes_uf_ml_frente: number | null;
  gastos_comunes_prorrata_kwh_clima: number | null;
  gastos_comunes_percentage: number | null;
  gastos_comunes_total_centro: number | null;
  gastos_comunes_tope: number | null;
  gastos_comunes_tope_type: string | null;
  has_extended_gastos_comunes: boolean;
  adicional_administracion_percentage: number | null;
  gastos_comunes_fixed_admin_uf?: number | null;
  
  // Other fields
  fondo_promocion_percentage: number | null;
  grace_months: number | null;
  notice_bilaterality: string;
  otros_egresos_amount: number | null;
  otros_egresos_description: string | null;
  
  // Template source
  source_type: string;
  source_draft_id: string | null;
  
  // Status
  status: string;
  
  // Related data
  escalations?: DraftEscalation[];
  notice_ranges?: DraftNoticeRange[];
}

export interface DraftEscalation {
  id: string;
  draft_id: string;
  month_number: number;
  amount: number;
}

export interface DraftNoticeRange {
  id: string;
  draft_id: string;
  start_month: number;
  end_month: number;
}

export interface CreateDraftInput {
  contract_id: string;
  name: string;
  source_type: "current" | "draft" | "scratch";
  source_draft_id?: string;
}

export function useRenegotiationDrafts(contractId: string) {
  const [drafts, setDrafts] = useState<RenegotiationDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("renegotiation_drafts")
        .select(`
          *,
          escalations:renegotiation_draft_escalations(*),
          notice_ranges:renegotiation_draft_notice_ranges(*)
        `)
        .eq("contract_id", contractId)
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDrafts((data || []) as RenegotiationDraft[]);
    } catch (error) {
      console.error("Error loading drafts:", error);
      toast.error("Error al cargar borradores");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  const createDraft = async (input: CreateDraftInput, currentVersion?: any) => {
    try {
      let draftData: any = {
        contract_id: input.contract_id,
        name: input.name,
        source_type: input.source_type,
        source_draft_id: input.source_draft_id || null,
      };

      if (input.source_type === "current" && currentVersion) {
        // Copy from current contract version
        draftData = {
          ...draftData,
          initial_rent: currentVersion.initial_rent,
          regime_rent: currentVersion.regime_rent,
          variable_rent_percentage: currentVersion.variable_rent_percentage,
          duration_months: currentVersion.duration_months,
          notice_type: currentVersion.notice_type,
          notice_value: currentVersion.notice_value,
          guarantee_multiplier: currentVersion.guarantee_multiplier,
          has_periodic_adjustments: currentVersion.has_periodic_adjustments || false,
          first_adjustment_month: currentVersion.first_adjustment_month,
          adjustment_periodicity_months: currentVersion.adjustment_periodicity_months,
          adjustment_type: currentVersion.adjustment_type,
          adjustment_value: currentVersion.adjustment_value,
          gastos_comunes_methodology: currentVersion.gastos_comunes_methodology || "uf_m2",
          gastos_comunes_uf_m2: currentVersion.gastos_comunes_uf_m2,
          gastos_comunes_uf_ml_frente: currentVersion.gastos_comunes_uf_ml_frente,
          gastos_comunes_prorrata_kwh_clima: currentVersion.gastos_comunes_prorrata_kwh_clima,
          gastos_comunes_percentage: currentVersion.gastos_comunes_percentage,
          gastos_comunes_total_centro: currentVersion.gastos_comunes_total_centro,
          gastos_comunes_tope: currentVersion.gastos_comunes_tope,
          gastos_comunes_tope_type: currentVersion.gastos_comunes_tope_type,
          has_extended_gastos_comunes: currentVersion.has_extended_gastos_comunes || false,
          adicional_administracion_percentage: currentVersion.adicional_administracion_percentage,
          fondo_promocion_percentage: currentVersion.fondo_promocion_percentage,
          grace_months: currentVersion.grace_months,
          notice_bilaterality: currentVersion.notice_bilaterality || "unilateral",
          otros_egresos_amount: currentVersion.otros_egresos_amount,
          otros_egresos_description: currentVersion.otros_egresos_description,
        };
      } else if (input.source_type === "draft" && input.source_draft_id) {
        // Copy from another draft
        const sourceDraft = drafts.find(d => d.id === input.source_draft_id);
        if (sourceDraft) {
          draftData = {
            ...draftData,
            initial_rent: sourceDraft.initial_rent,
            regime_rent: sourceDraft.regime_rent,
            variable_rent_percentage: sourceDraft.variable_rent_percentage,
            duration_months: sourceDraft.duration_months,
            notice_type: sourceDraft.notice_type,
            notice_value: sourceDraft.notice_value,
            guarantee_multiplier: sourceDraft.guarantee_multiplier,
            has_periodic_adjustments: sourceDraft.has_periodic_adjustments,
            first_adjustment_month: sourceDraft.first_adjustment_month,
            adjustment_periodicity_months: sourceDraft.adjustment_periodicity_months,
            adjustment_type: sourceDraft.adjustment_type,
            adjustment_value: sourceDraft.adjustment_value,
            gastos_comunes_methodology: sourceDraft.gastos_comunes_methodology,
            gastos_comunes_uf_m2: sourceDraft.gastos_comunes_uf_m2,
            gastos_comunes_uf_ml_frente: sourceDraft.gastos_comunes_uf_ml_frente,
            gastos_comunes_prorrata_kwh_clima: sourceDraft.gastos_comunes_prorrata_kwh_clima,
            gastos_comunes_percentage: sourceDraft.gastos_comunes_percentage,
            gastos_comunes_total_centro: sourceDraft.gastos_comunes_total_centro,
            gastos_comunes_tope: sourceDraft.gastos_comunes_tope,
            gastos_comunes_tope_type: sourceDraft.gastos_comunes_tope_type,
            has_extended_gastos_comunes: sourceDraft.has_extended_gastos_comunes,
            adicional_administracion_percentage: sourceDraft.adicional_administracion_percentage,
            fondo_promocion_percentage: sourceDraft.fondo_promocion_percentage,
            grace_months: sourceDraft.grace_months,
            notice_bilaterality: sourceDraft.notice_bilaterality,
            otros_egresos_amount: sourceDraft.otros_egresos_amount,
            otros_egresos_description: sourceDraft.otros_egresos_description,
          };
        }
      } else {
        // Scratch - set defaults
        draftData = {
          ...draftData,
          regime_rent: 0,
          duration_months: 12,
          notice_type: "meses",
          notice_value: "3",
        };
      }

      const { data, error } = await supabase
        .from("renegotiation_drafts")
        .insert(draftData)
        .select()
        .single();

      if (error) throw error;

      // Copy escalations if from current version or draft
      if (input.source_type === "current" && currentVersion?.rent_escalations?.length > 0) {
        await supabase.from("renegotiation_draft_escalations").insert(
          currentVersion.rent_escalations.map((e: any) => ({
            draft_id: data.id,
            month_number: e.month_number,
            amount: e.amount,
          }))
        );
      } else if (input.source_type === "draft" && input.source_draft_id) {
        const sourceDraft = drafts.find(d => d.id === input.source_draft_id);
        if (sourceDraft?.escalations?.length) {
          await supabase.from("renegotiation_draft_escalations").insert(
            sourceDraft.escalations.map((e: any) => ({
              draft_id: data.id,
              month_number: e.month_number,
              amount: e.amount,
            }))
          );
        }
        // Copy notice ranges from source draft
        if (sourceDraft?.notice_ranges?.length) {
          await supabase.from("renegotiation_draft_notice_ranges").insert(
            sourceDraft.notice_ranges.map((r: any) => ({
              draft_id: data.id,
              start_month: r.start_month,
              end_month: r.end_month,
            }))
          );
        }
      }

      // Copy notice ranges if from current version
      if (input.source_type === "current" && currentVersion?.notice_ranges?.length > 0) {
        await supabase.from("renegotiation_draft_notice_ranges").insert(
          currentVersion.notice_ranges.map((r: any) => ({
            draft_id: data.id,
            start_month: r.start_month,
            end_month: r.end_month,
          }))
        );
      }

      toast.success("Borrador creado exitosamente");
      await loadDrafts();
      return data;
    } catch (error) {
      console.error("Error creating draft:", error);
      toast.error("Error al crear borrador");
      throw error;
    }
  };

  const updateDraft = async (draftId: string, updates: Partial<RenegotiationDraft>) => {
    try {
      const { error } = await supabase
        .from("renegotiation_drafts")
        .update(updates)
        .eq("id", draftId);

      if (error) throw error;
      await loadDrafts();
    } catch (error) {
      console.error("Error updating draft:", error);
      toast.error("Error al actualizar borrador");
      throw error;
    }
  };

  const deleteDraft = async (draftId: string) => {
    try {
      const { error } = await supabase
        .from("renegotiation_drafts")
        .delete()
        .eq("id", draftId);

      if (error) throw error;
      toast.success("Borrador eliminado");
      await loadDrafts();
    } catch (error) {
      console.error("Error deleting draft:", error);
      toast.error("Error al eliminar borrador");
      throw error;
    }
  };

  const updateDraftEscalations = async (draftId: string, escalations: Array<{ month_number: number; amount: number }>) => {
    try {
      // Delete existing escalations
      await supabase
        .from("renegotiation_draft_escalations")
        .delete()
        .eq("draft_id", draftId);

      // Insert new escalations
      if (escalations.length > 0) {
        const { error } = await supabase
          .from("renegotiation_draft_escalations")
          .insert(
            escalations.map(e => ({
              draft_id: draftId,
              month_number: e.month_number,
              amount: e.amount,
            }))
          );
        if (error) throw error;
      }

      await loadDrafts();
    } catch (error) {
      console.error("Error updating escalations:", error);
      throw error;
    }
  };

  const updateDraftNoticeRanges = async (draftId: string, ranges: Array<{ start_month: number; end_month: number }>) => {
    try {
      // Delete existing notice ranges
      await supabase
        .from("renegotiation_draft_notice_ranges")
        .delete()
        .eq("draft_id", draftId);

      // Insert new ranges
      if (ranges.length > 0) {
        const { error } = await supabase
          .from("renegotiation_draft_notice_ranges")
          .insert(
            ranges.map(r => ({
              draft_id: draftId,
              start_month: r.start_month,
              end_month: r.end_month,
            }))
          );
        if (error) throw error;
      }

      await loadDrafts();
    } catch (error) {
      console.error("Error updating notice ranges:", error);
      throw error;
    }
  };

  const acceptDraft = async (draftId: string, currentVersionId: string) => {
    try {
      const draft = drafts.find(d => d.id === draftId);
      if (!draft) throw new Error("Borrador no encontrado");

      // Set current version as not current
      await supabase
        .from("contract_versions")
        .update({ is_current: false })
        .eq("id", currentVersionId);

      // Get current max version number
      const { data: versions } = await supabase
        .from("contract_versions")
        .select("version_number")
        .eq("contract_id", contractId)
        .order("version_number", { ascending: false })
        .limit(1);

      const newVersionNumber = (versions?.[0]?.version_number || 0) + 1;

      // Create new contract version from draft
      const versionData = {
        contract_id: contractId,
        version_number: newVersionNumber,
        is_current: true,
        is_renegotiation: true,
        initial_rent: draft.initial_rent,
        regime_rent: draft.regime_rent,
        variable_rent_percentage: draft.variable_rent_percentage,
        duration_months: draft.duration_months,
        notice_type: draft.notice_type as "meses" | "fecha" | "rangos",
        notice_value: draft.notice_value,
        effective_date: draft.effective_from_signature ? null : draft.effective_date,
        guarantee_multiplier: draft.guarantee_multiplier,
        has_periodic_adjustments: draft.has_periodic_adjustments,
        first_adjustment_month: draft.first_adjustment_month,
        adjustment_periodicity_months: draft.adjustment_periodicity_months,
        adjustment_type: draft.adjustment_type,
        adjustment_value: draft.adjustment_value,
        gastos_comunes_methodology: draft.gastos_comunes_methodology,
        gastos_comunes_uf_m2: draft.gastos_comunes_uf_m2,
        gastos_comunes_uf_ml_frente: draft.gastos_comunes_uf_ml_frente,
        gastos_comunes_prorrata_kwh_clima: draft.gastos_comunes_prorrata_kwh_clima,
        gastos_comunes_percentage: draft.gastos_comunes_percentage,
        gastos_comunes_total_centro: draft.gastos_comunes_total_centro,
        gastos_comunes_tope: draft.gastos_comunes_tope,
        gastos_comunes_tope_type: draft.gastos_comunes_tope_type,
        has_extended_gastos_comunes: draft.has_extended_gastos_comunes,
        adicional_administracion_percentage: draft.adicional_administracion_percentage,
        fondo_promocion_percentage: draft.fondo_promocion_percentage,
        grace_months: draft.grace_months,
        notice_bilaterality: draft.notice_bilaterality,
        otros_egresos_amount: draft.otros_egresos_amount,
        otros_egresos_description: draft.otros_egresos_description,
      };

      const { data: newVersion, error: insertError } = await supabase
        .from("contract_versions")
        .insert(versionData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Copy escalations to new version
      if (draft.escalations && draft.escalations.length > 0) {
        await supabase.from("rent_escalations").insert(
          draft.escalations.map((e: DraftEscalation) => ({
            version_id: newVersion.id,
            month_number: e.month_number,
            amount: e.amount,
          }))
        );
      }

      // Copy notice ranges to new version
      if (draft.notice_ranges && draft.notice_ranges.length > 0) {
        await supabase.from("notice_ranges").insert(
          draft.notice_ranges.map((r: DraftNoticeRange) => ({
            version_id: newVersion.id,
            start_month: r.start_month,
            end_month: r.end_month,
          }))
        );
      }

      // Mark draft as accepted
      await supabase
        .from("renegotiation_drafts")
        .update({ status: "accepted" })
        .eq("id", draftId);

      // Delete all other drafts for this contract
      await supabase
        .from("renegotiation_drafts")
        .delete()
        .eq("contract_id", contractId)
        .neq("id", draftId);

      toast.success("Renegociación aceptada exitosamente");
      return newVersion;
    } catch (error) {
      console.error("Error accepting draft:", error);
      toast.error("Error al aceptar renegociación");
      throw error;
    }
  };

  return {
    drafts,
    loading,
    loadDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    updateDraftEscalations,
    updateDraftNoticeRanges,
    acceptDraft,
  };
}
