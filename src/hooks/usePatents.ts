import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ContractWithPatent, 
  PatentChecklistSection, 
  PatentChecklistItem, 
  PatentEmitter,
  PatentDocument,
  PatentPriority,
  PatentDocStatus,
  PatentItemEmitter,
  PatentStatus
} from "@/components/patents/types";

export function usePatents() {
  const [contracts, setContracts] = useState<ContractWithPatent[]>([]);
  const [sections, setSections] = useState<PatentChecklistSection[]>([]);
  const [items, setItems] = useState<PatentChecklistItem[]>([]);
  const [emitters, setEmitters] = useState<PatentEmitter[]>([]);
  const [itemEmitters, setItemEmitters] = useState<PatentItemEmitter[]>([]);
  const [statuses, setStatuses] = useState<PatentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Execute all queries in parallel for better performance
      const [
        contractsResult,
        sectionsResult,
        itemsResult,
        emittersResult,
        itemEmittersResult,
        statusesResult
      ] = await Promise.all([
        supabase
          .from("contracts")
          .select(`
            id,
            name,
            status,
            patente_status,
            contract_addresses (region, commune, street, number),
            contract_companies (companies (name)),
            contract_patents (id, contract_id, priority, priority_changed_at, priority_changed_by, comments, next_actions),
            patent_documents (
              id, contract_id, checklist_item_id, status, status_changed_at,
              emitter_id, responsible, start_date, deadline_days, end_date,
              document_url, notes, custom_data
            )
          `)
          .eq("status", "firmado")
          .is("deleted_at", null),
        supabase
          .from("patent_checklist_sections")
          .select("*")
          .order("display_order"),
        supabase
          .from("patent_checklist_items")
          .select("*")
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("patent_emitters")
          .select("*")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("patent_item_emitters")
          .select("*"),
        supabase
          .from("patent_statuses")
          .select("*")
          .eq("is_active", true)
          .order("display_order")
      ]);

      setContracts((contractsResult.data as any[]) || []);
      setSections((sectionsResult.data as PatentChecklistSection[]) || []);
      setItems((itemsResult.data as PatentChecklistItem[]) || []);
      setEmitters((emittersResult.data as PatentEmitter[]) || []);
      setItemEmitters((itemEmittersResult.data as PatentItemEmitter[]) || []);
      setStatuses((statusesResult.data as PatentStatus[]) || []);
    } catch (error) {
      console.error("Error loading patents data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updatePriority = async (contractId: string, priority: PatentPriority, userId: string) => {
    const { data: existing } = await supabase
      .from("contract_patents")
      .select("id")
      .eq("contract_id", contractId)
      .single();

    const now = new Date().toISOString();

    if (existing) {
      await supabase
        .from("contract_patents")
        .update({
          priority,
          priority_changed_at: now,
          priority_changed_by: userId,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("contract_patents")
        .insert({
          contract_id: contractId,
          priority,
          priority_changed_at: now,
          priority_changed_by: userId,
        });
    }

    // Update local state instead of reloading
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c;
      return {
        ...c,
        contract_patents: c.contract_patents 
          ? { ...c.contract_patents, priority, priority_changed_at: now, priority_changed_by: userId }
          : { id: '', contract_id: contractId, priority, priority_changed_at: now, priority_changed_by: userId }
      };
    }));
  };

  const updatePatenteStatus = async (contractId: string, patenteStatus: string) => {
    await supabase
      .from("contracts")
      .update({ patente_status: patenteStatus })
      .eq("id", contractId);

    // Update local state
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c;
      return { ...c, patente_status: patenteStatus };
    }));
  };

  const updateComments = async (contractId: string, comments: string, nextActions: string) => {
    const { data: existing } = await supabase
      .from("contract_patents")
      .select("id")
      .eq("contract_id", contractId)
      .single();

    const now = new Date().toISOString();

    if (existing) {
      await supabase
        .from("contract_patents")
        .update({
          comments,
          next_actions: nextActions,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("contract_patents")
        .insert({
          contract_id: contractId,
          priority: 'priority_3',
          comments,
          next_actions: nextActions,
        });
    }

    // Update local state
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c;
      return {
        ...c,
        contract_patents: c.contract_patents 
          ? { ...c.contract_patents, comments, next_actions: nextActions }
          : { id: '', contract_id: contractId, priority: 'priority_3', comments, next_actions: nextActions }
      };
    }));
  };

  const updateDocumentStatus = async (
    contractId: string,
    checklistItemId: string,
    status: PatentDocStatus,
    userId: string
  ) => {
    const { data: existing } = await supabase
      .from("patent_documents")
      .select("id")
      .eq("contract_id", contractId)
      .eq("checklist_item_id", checklistItemId)
      .single();

    const now = new Date().toISOString();
    let newDocId = existing?.id;

    if (existing) {
      await supabase
        .from("patent_documents")
        .update({
          status,
          status_changed_at: now,
          status_changed_by: userId,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      const { data: inserted } = await supabase
        .from("patent_documents")
        .insert({
          contract_id: contractId,
          checklist_item_id: checklistItemId,
          status,
          status_changed_at: now,
          status_changed_by: userId,
        })
        .select("id")
        .single();
      newDocId = inserted?.id;
    }

    // Update local state instead of reloading
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c;
      const existingDocs = c.patent_documents || [];
      const docIndex = existingDocs.findIndex(d => d.checklist_item_id === checklistItemId);
      
      if (docIndex >= 0) {
        const updatedDocs = [...existingDocs];
        updatedDocs[docIndex] = { ...updatedDocs[docIndex], status, status_changed_at: now, status_changed_by: userId };
        return { ...c, patent_documents: updatedDocs };
      } else {
        return {
          ...c,
          patent_documents: [...existingDocs, {
            id: newDocId || '',
            contract_id: contractId,
            checklist_item_id: checklistItemId,
            status,
            status_changed_at: now,
            status_changed_by: userId,
          } as PatentDocument]
        };
      }
    }));
  };

  const updateDocument = async (
    contractId: string,
    checklistItemId: string,
    data: Partial<PatentDocument>
  ) => {
    const { data: existing } = await supabase
      .from("patent_documents")
      .select("id")
      .eq("contract_id", contractId)
      .eq("checklist_item_id", checklistItemId)
      .single();

    const now = new Date().toISOString();
    let newDocId = existing?.id;

    if (existing) {
      await supabase
        .from("patent_documents")
        .update({
          ...data,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      const { data: inserted } = await supabase
        .from("patent_documents")
        .insert({
          contract_id: contractId,
          checklist_item_id: checklistItemId,
          status: 'pendiente',
          ...data,
        })
        .select("id")
        .single();
      newDocId = inserted?.id;
    }

    // Update local state instead of reloading
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c;
      const existingDocs = c.patent_documents || [];
      const docIndex = existingDocs.findIndex(d => d.checklist_item_id === checklistItemId);
      
      if (docIndex >= 0) {
        const updatedDocs = [...existingDocs];
        updatedDocs[docIndex] = { ...updatedDocs[docIndex], ...data };
        return { ...c, patent_documents: updatedDocs };
      } else {
        return {
          ...c,
          patent_documents: [...existingDocs, {
            id: newDocId || '',
            contract_id: contractId,
            checklist_item_id: checklistItemId,
            status: 'pendiente',
            ...data,
          } as PatentDocument]
        };
      }
    }));
  };

  // Calculate document criticality stats
  const getCriticalStats = useCallback(() => {
    let pendingCount = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    contracts.forEach(contract => {
      (contract.patent_documents || []).forEach(doc => {
        if (doc.status === 'pendiente') {
          pendingCount++;
          if (doc.end_date && new Date(doc.end_date) < today) {
            overdueCount++;
          } else if (doc.end_date && new Date(doc.end_date) <= thirtyDaysFromNow) {
            upcomingCount++;
          }
        }
      });
    });

    const criticalContracts = contracts.filter(c => 
      c.contract_patents?.priority === 'priority_1'
    ).length;

    return {
      criticalContracts,
      pendingCount,
      overdueCount,
      upcomingCount,
    };
  }, [contracts]);

  return {
    contracts,
    sections,
    items,
    emitters,
    itemEmitters,
    statuses,
    loading,
    loadData,
    updatePriority,
    updatePatenteStatus,
    updateComments,
    updateDocumentStatus,
    updateDocument,
    getCriticalStats,
  };
}
