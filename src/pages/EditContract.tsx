import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, X, RotateCcw, ChevronsUpDown } from "lucide-react";
import { RentEscalations, Escalation } from "@/components/contracts/RentEscalations";
import { CurrencyInput } from "@/components/contracts/CurrencyInput";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useEditContractSections, EditSectionKey } from "@/hooks/useEditContractSections";
import { CompanySelect } from "@/components/contracts/CompanySelect";
import { EditableSectionWrapper } from "@/components/contracts/EditableSectionWrapper";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EditContract = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMissingFieldsDialog, setShowMissingFieldsDialog] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Contract basic info
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  
  // Address
  const [addressId, setAddressId] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [commune, setCommune] = useState("");
  const [region, setRegion] = useState("");
  const [rolSii, setRolSii] = useState("");
  
  // Contact
  const [contactId, setContactId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [emails, setEmails] = useState<string[]>([""]);
  const [countryCode, setCountryCode] = useState("+56");
  
  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  
  // Commercial conditions
  const [versionId, setVersionId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [hasSeparateDates, setHasSeparateDates] = useState(false);
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  const [hasEscalation, setHasEscalation] = useState(false);
  const [graceMonths, setGraceMonths] = useState(0);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [duration, setDuration] = useState("");
  const [noticeType, setNoticeType] = useState<"fecha" | "meses" | "rangos">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeRanges, setNoticeRanges] = useState<Array<{ id?: string; start_month: number; end_month: number }>>([]);
  const [escalations, setEscalations] = useState<Array<{ id?: string; month_number: number; amount: number }>>([]);
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">("unilateral_gp");
  
  // Guarantee and periodic adjustments
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState("");
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState("");
  const [adjustmentPeriodicityMonths, setAdjustmentPeriodicityMonths] = useState("");
  
  // Gastos comunes and fondo promoción
  const [hasExtendedGastosComunes, setHasExtendedGastosComunes] = useState(false);
  const [gastosComunesMethodology, setGastosComunesMethodology] = useState<"uf_m2" | "percentage">("uf_m2");
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState("");
  const [gastosComunesUfMlFrente, setGastosComunesUfMlFrente] = useState("");
  const [gastosComunesProrratKwhClima, setGastosComunesProrratKwhClima] = useState("");
  const [gastosComunesPercentage, setGastosComunesPercentage] = useState("");
  const [gastosComunesTotalCentro, setGastosComunesTotalCentro] = useState("");
  const [gastosComunesTope, setGastosComunesTope] = useState("");
  const [gastosComunesTopeType, setGastosComunesTopeType] = useState<"fixed" | "uf_m2">("fixed");
  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState("");
  const [adicionalAdministracionPercentage, setAdicionalAdministracionPercentage] = useState("");
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState("");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState("");
  
  // Surface data for gastos comunes calculation
  const [superficieEdificadaLocal, setSuperficieEdificadaLocal] = useState<number>(0);
  const [metrosLinealesFrente, setMetrosLinealesFrente] = useState<number>(0);
  
  const { ufValue, convertPesosToUF } = useEconomicIndicators();
  
  const {
    sections: commercialSections,
    reorderSections,
    toggleCollapsed,
    isCollapsed,
    collapseAll,
    expandAll,
    resetToDefault,
    canReorder,
  } = useEditContractSections();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSections(active.id as string, over.id as string);
    }
  };

  const sectionTitles: Record<EditSectionKey, string> = {
    dates: "Fechas",
    currency: "Moneda",
    escalation: "Canon Arriendo",
    variableRent: "Arriendo Variable",
    guarantee: "Garantía",
    gastosComunes: "Gastos Comunes",
    fondoPromocion: "Fondo de Promoción",
    otrosArrendamientos: "Otros Arrendamientos",
    periodicAdjustments: "Reajustes Periódicos",
    duration: "Duración",
    noticeType: "Aviso de Término",
  };

  useEffect(() => {
    if (id) {
      loadContract();
    }
  }, [id]);

  const loadContract = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          *,
          contract_addresses (*),
          contract_contacts (*),
          contract_versions (*, rent_escalations (*))
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      setName(data.name);
      setCompanyId(data.company_id || "");
      setSuperficieEdificadaLocal(data.superficie_edificada_local || 0);
      setMetrosLinealesFrente(data.metros_lineales_frente || 0);
      setCurrency((data.display_currency as "UF" | "CLP") || "UF");

      const address = data.contract_addresses?.[0];
      if (address) {
        setAddressId(address.id);
        setStreet(address.street);
        setNumber(address.number);
        setCommune(address.commune);
        setRegion(address.region);
        setRolSii(address.rol_sii || "");
      }

      const contact = data.contract_contacts?.[0];
      if (contact) {
        setContactId(contact.id);
        setCompany(contact.company);
        setContactName(contact.name);
        // Parse phone: extract digits after country code
        const phoneMatch = contact.phone?.match(/^\+(\d+)\s?(.*)$/);
        if (phoneMatch) {
          setCountryCode(`+${phoneMatch[1]}`);
          setPhoneDigits(phoneMatch[2]?.replace(/\D/g, "") || "");
        } else {
          setPhoneDigits(contact.phone?.replace(/\D/g, "") || "");
        }
        // Parse emails: split by comma or semicolon
        const emailList = contact.email?.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean) || [""];
        setEmails(emailList.length > 0 ? emailList : [""]);
      }
      
      // Get country code from address
      const addressData = data.contract_addresses?.[0];
      if (addressData) {
        const countryCodes: Record<string, string> = {
          "Chile": "+56",
          "Argentina": "+54",
          "Perú": "+51",
          "Colombia": "+57",
          "México": "+52",
        };
        setCountryCode(countryCodes[addressData.country] || "+56");
      }

      const version = data.contract_versions?.find((v: any) => v.is_current);
      if (version) {
        setVersionId(version.id);
        setEffectiveDate(version.effective_date || "");
        // hasEscalation is true if there are escalations, grace months, or initial_rent differs from regime_rent
        const hasEscalationsData = (version.rent_escalations && version.rent_escalations.length > 0) ||
          ((version as any).grace_months && (version as any).grace_months > 0) ||
          (version.initial_rent !== null && version.initial_rent !== version.regime_rent);
        setHasEscalation(hasEscalationsData);
        setGraceMonths((version as any).grace_months || 0);
        setInitialRent(version.initial_rent?.toString() || "");
        setRegimeRent(version.regime_rent.toString());
        setVariableRentPercentage(version.variable_rent_percentage?.toString() || "");
        setDuration(version.duration_months.toString());
        setNoticeType(version.notice_type as "fecha" | "meses" | "rangos");
        setNoticeValue(version.notice_value);
        setEscalations(version.rent_escalations || []);
        
        // Load signed date - check if different from effective date
        if (data.signed_date) {
          setSignedDate(data.signed_date);
          if (data.signed_date !== version.effective_date) {
            setHasSeparateDates(true);
          }
        }
        
        // Load notice ranges if notice_type is "rangos"
        if (version.notice_type === "rangos") {
          const { data: ranges } = await supabase
            .from("notice_ranges")
            .select("*")
            .eq("version_id", version.id)
            .order("start_month");
          setNoticeRanges(ranges || []);
        }
        
        // Load guarantee and periodic adjustments
        setGuaranteeMultiplier(version.guarantee_multiplier?.toString() || "");
        setHasPeriodicAdjustments(version.has_periodic_adjustments || false);
        setAdjustmentType((version as any).adjustment_type || "percentage");
        setAdjustmentValue((version as any).adjustment_value?.toString() || "");
        setFirstAdjustmentMonth(version.first_adjustment_month?.toString() || "");
        setAdjustmentPeriodicityMonths(version.adjustment_periodicity_months?.toString() || "");
        
        // Load gastos comunes and fondo promoción
        setGastosComunesUfM2(version.gastos_comunes_uf_m2?.toString() || "");
        setGastosComunesUfMlFrente((version as any).gastos_comunes_uf_ml_frente?.toString() || "");
        setGastosComunesProrratKwhClima((version as any).gastos_comunes_prorrata_kwh_clima?.toString() || "");
        setFondoPromocionPercentage(version.fondo_promocion_percentage?.toString() || "");
        setAdicionalAdministracionPercentage((version as any).adicional_administracion_percentage?.toString() || "");
        
        // Load extended gastos comunes preference from database
        setHasExtendedGastosComunes((version as any).has_extended_gastos_comunes ?? false);
        
        // Load gastos comunes methodology
        setGastosComunesMethodology((version as any).gastos_comunes_methodology || "uf_m2");
        setGastosComunesPercentage((version as any).gastos_comunes_percentage?.toString() || "");
        setGastosComunesTotalCentro((version as any).gastos_comunes_total_centro?.toString() || "");
        setGastosComunesTope((version as any).gastos_comunes_tope?.toString() || "");
        setGastosComunesTopeType((version as any).gastos_comunes_tope_type || "fixed");
        
        // Load notice bilaterality
        setNoticeBilaterality((version as any).notice_bilaterality || "unilateral_gp");
        
        // Load otros egresos
        setOtrosEgresosAmount((version as any).otros_egresos_amount?.toString() || "");
        setOtrosEgresosDescription((version as any).otros_egresos_description || "");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar el contrato",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const getRequiredFieldsStatus = () => {
    const missing: string[] = [];
    if (!name.trim()) missing.push("Nombre del Contrato");
    if (!street.trim()) missing.push("Calle");
    if (!number.trim()) missing.push("Número");
    if (!commune.trim()) missing.push("Comuna");
    if (!region.trim()) missing.push("Región");
    if (!regimeRent.trim()) missing.push("Renta en Régimen");
    if (!duration.trim()) missing.push("Duración");
    return missing;
  };

  const handleSubmit = async (e: React.FormEvent, bypassValidation = false) => {
    e.preventDefault();
    
    // Check for missing required fields
    if (!bypassValidation) {
      const missing = getRequiredFieldsStatus();
      if (missing.length > 0) {
        setMissingFields(missing);
        setShowMissingFieldsDialog(true);
        return;
      }
    }
    
    setSaving(true);

    try {
      // Update contract including signed_date, display_currency, and company_id
      const { error: contractError } = await supabase
        .from("contracts")
        .update({ 
          name,
          signed_date: hasSeparateDates ? signedDate || null : effectiveDate || null,
          display_currency: currency,
          company_id: companyId || null,
        } as any)
        .eq("id", id);

      if (contractError) throw contractError;

      // Update or create address
      const fullPhone = phoneDigits ? `${countryCode} ${phoneDigits}` : "";
      const fullEmail = emails.filter(e => e.trim()).join(", ");

      if (addressId) {
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .update({ street, number, commune, region, rol_sii: rolSii || null })
          .eq("id", addressId);

        if (addressError) throw addressError;
      } else if (street || number || commune || region || rolSii) {
        // Create new address if doesn't exist
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .insert({
            contract_id: id,
            street: street || "",
            number: number || "",
            commune: commune || "",
            region: region || "",
            rol_sii: rolSii || null,
          });

        if (addressError) throw addressError;
      }

      // Update or create contact - always save if any contact data exists
      const hasContactData = company || contactName || fullEmail || fullPhone;
      
      if (contactId) {
        const { error: contactError } = await supabase
          .from("contract_contacts")
          .update({
            company: company || "",
            name: contactName || "",
            phone: fullPhone,
            email: fullEmail,
          })
          .eq("id", contactId);

        if (contactError) throw contactError;
      } else if (hasContactData) {
        // Create new contact if doesn't exist but has some data
        const { data: newContact, error: contactError } = await supabase
          .from("contract_contacts")
          .insert({
            contract_id: id,
            company: company || "",
            name: contactName || "",
            phone: fullPhone,
            email: fullEmail,
          })
          .select()
          .single();

        if (contactError) throw contactError;
        if (newContact) setContactId(newContact.id);
      }

      // Update or create version
      let currentVersionId = versionId;
      
      if (versionId) {
        const { error: versionError } = await supabase
          .from("contract_versions")
          .update({
            effective_date: effectiveDate || null,
            initial_rent: hasEscalation ? (initialRent !== "" ? parseFloat(initialRent) : (graceMonths > 0 ? 0 : null)) : null,
            regime_rent: parseFloat(regimeRent) || 0,
            variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
            duration_months: parseInt(duration) || 12,
            notice_type: noticeType === "rangos" ? "rangos" as any : noticeType,
            notice_value: noticeType === "rangos" ? "" : (noticeValue || "3"),
            guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
            has_periodic_adjustments: hasPeriodicAdjustments,
            adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
            adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
            first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
            adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicityMonths ? parseInt(adjustmentPeriodicityMonths) : null,
            gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" && gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
            gastos_comunes_uf_ml_frente: gastosComunesMethodology === "uf_m2" && gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
            gastos_comunes_prorrata_kwh_clima: gastosComunesMethodology === "uf_m2" && gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
            gastos_comunes_methodology: gastosComunesMethodology,
            gastos_comunes_percentage: gastosComunesMethodology === "percentage" && gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
            gastos_comunes_total_centro: gastosComunesMethodology === "percentage" && gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
            gastos_comunes_tope: gastosComunesMethodology === "percentage" && gastosComunesTope ? parseFloat(gastosComunesTope) : null,
            gastos_comunes_tope_type: gastosComunesMethodology === "percentage" ? gastosComunesTopeType : null,
            fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
            adicional_administracion_percentage: adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
            has_extended_gastos_comunes: gastosComunesMethodology === "uf_m2" ? hasExtendedGastosComunes : false,
            notice_bilaterality: noticeBilaterality,
            grace_months: graceMonths || 0,
            otros_egresos_amount: otrosEgresosAmount ? parseFloat(otrosEgresosAmount) : null,
            otros_egresos_description: otrosEgresosDescription || null,
          } as any)
          .eq("id", versionId);

        if (versionError) throw versionError;
      } else {
        // Create new version if doesn't exist
        const { data: newVersion, error: versionError } = await supabase
          .from("contract_versions")
          .insert({
            contract_id: id,
            version_number: 1,
            is_current: true,
            effective_date: effectiveDate || null,
            initial_rent: hasEscalation ? (initialRent !== "" ? parseFloat(initialRent) : (graceMonths > 0 ? 0 : null)) : null,
            regime_rent: parseFloat(regimeRent) || 0,
            variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
            duration_months: parseInt(duration) || 12,
            notice_type: (noticeType === "rangos" ? "rangos" : noticeType) as any,
            notice_value: noticeType === "rangos" ? "" : (noticeValue || "3"),
            guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
            has_periodic_adjustments: hasPeriodicAdjustments,
            adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
            adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
            first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
            adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicityMonths ? parseInt(adjustmentPeriodicityMonths) : null,
            gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" && gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
            gastos_comunes_uf_ml_frente: gastosComunesMethodology === "uf_m2" && gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
            gastos_comunes_prorrata_kwh_clima: gastosComunesMethodology === "uf_m2" && gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
            gastos_comunes_methodology: gastosComunesMethodology,
            gastos_comunes_percentage: gastosComunesMethodology === "percentage" && gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
            gastos_comunes_total_centro: gastosComunesMethodology === "percentage" && gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
            gastos_comunes_tope: gastosComunesMethodology === "percentage" && gastosComunesTope ? parseFloat(gastosComunesTope) : null,
            gastos_comunes_tope_type: gastosComunesMethodology === "percentage" ? gastosComunesTopeType : null,
            fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
            adicional_administracion_percentage: adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
            has_extended_gastos_comunes: gastosComunesMethodology === "uf_m2" ? hasExtendedGastosComunes : false,
            notice_bilaterality: noticeBilaterality,
            otros_egresos_amount: otrosEgresosAmount ? parseFloat(otrosEgresosAmount) : null,
            otros_egresos_description: otrosEgresosDescription || null,
          } as any)
          .select()
          .single();

        if (versionError) throw versionError;
        currentVersionId = newVersion.id;
      }

      // Handle escalations
      if (currentVersionId) {
        if (hasEscalation) {
          // Delete existing escalations
          await supabase
            .from("rent_escalations")
            .delete()
            .eq("version_id", currentVersionId);

          // Insert new escalations
          if (escalations.length > 0) {
            const { error: escalationError } = await supabase
              .from("rent_escalations")
              .insert(
                escalations.map((e) => ({
                  version_id: currentVersionId,
                  month_number: e.month_number,
                  amount: e.amount,
                }))
              );

            if (escalationError) throw escalationError;
          }
        } else {
          // Remove escalations if hasEscalation is false
          await supabase
            .from("rent_escalations")
            .delete()
            .eq("version_id", currentVersionId);
        }
      }

      // Handle notice ranges
      if (currentVersionId && noticeType === "rangos") {
        // Delete existing notice ranges
        await supabase
          .from("notice_ranges")
          .delete()
          .eq("version_id", currentVersionId);

        // Insert new notice ranges
        if (noticeRanges.length > 0) {
          const { error: rangeError } = await supabase
            .from("notice_ranges")
            .insert(
              noticeRanges.map((r) => ({
                version_id: currentVersionId,
                start_month: r.start_month,
                end_month: r.end_month,
              }))
            );

          if (rangeError) throw rangeError;
        }
      } else if (currentVersionId) {
        // Remove notice ranges if not using "rangos" type
        await supabase
          .from("notice_ranges")
          .delete()
          .eq("version_id", currentVersionId);
      }

      // Generate termination notice alert
      if (effectiveDate && duration && (noticeType === 'meses' || noticeType === 'fecha' || noticeType === 'rangos')) {
        // Delete existing early_termination_notice alerts for this contract
        await supabase
          .from("alerts")
          .delete()
          .eq("contract_id", id)
          .eq("alert_type", "early_termination_notice");

        // Calculate expiration date
        const startDate = new Date(effectiveDate);
        const expirationDate = new Date(startDate);
        expirationDate.setMonth(expirationDate.getMonth() + (parseInt(duration) || 12));

        let alertDate: Date | null = null;

        if (noticeType === 'meses' && noticeValue) {
          // Alert date is X months before expiration
          alertDate = new Date(expirationDate);
          alertDate.setMonth(alertDate.getMonth() - parseInt(noticeValue));
        } else if (noticeType === 'fecha' && noticeValue) {
          // Alert date is the specific date
          alertDate = new Date(noticeValue);
        } else if (noticeType === 'rangos' && noticeRanges.length > 0) {
          // Alert date is the start of the first range (in months from start)
          const firstRange = noticeRanges.sort((a, b) => a.start_month - b.start_month)[0];
          alertDate = new Date(startDate);
          alertDate.setMonth(alertDate.getMonth() + firstRange.start_month - 1);
        }

        if (alertDate && alertDate > new Date()) {
          const { error: alertError } = await supabase
            .from("alerts")
            .insert({
              contract_id: id,
              title: `Aviso de término anticipado: ${name}`,
              message: `Fecha límite para dar aviso de término anticipado del contrato ${name}.`,
              alert_type: "early_termination_notice",
              due_date: alertDate.toISOString().split('T')[0],
              days_before: [30, 15, 7, 1],
              channels: ["email"],
              is_active: true,
            });

          if (alertError) {
            console.error("Error creating alert:", alertError);
          }
        }
      }

      setHasUnsavedChanges(false);

      toast({
        title: "Contrato actualizado",
        description: "Los cambios han sido guardados",
      });

      navigate(`/contracts/${id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al actualizar el contrato",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(`/contracts/${id}`);
      setShowUnsavedDialog(true);
    } else {
      navigate(`/contracts/${id}`);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  };

  const handleConfirmSave = async () => {
    setShowUnsavedDialog(false);
    // Trigger form submission
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  const handleConfirmSaveWithMissingFields = async () => {
    setShowMissingFieldsDialog(false);
    setSaving(true);
    // Create a synthetic event and call handleSubmit with bypass
    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
    await handleSubmit(syntheticEvent, true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="gap-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Editar Contrato</h1>
        </div>
      </header>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea guardar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tiene cambios sin guardar. ¿Qué desea hacer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConfirmDiscard}>
              Descartar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Missing Fields Confirmation Dialog */}
      <AlertDialog open={showMissingFieldsDialog} onOpenChange={setShowMissingFieldsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Faltan datos obligatorios</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Los siguientes campos están vacíos:</span>
              <ul className="list-disc list-inside mt-2 text-destructive">
                {missingFields.map((field, idx) => (
                  <li key={idx}>{field}</li>
                ))}
              </ul>
              <span className="block mt-2">¿Desea guardar de todas formas?</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSaveWithMissingFields}>
              Guardar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CompanySelect 
                value={companyId} 
                onChange={(val) => { setCompanyId(val); setHasUnsavedChanges(true); }} 
              />
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Contrato *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setHasUnsavedChanges(true); }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dirección</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Calle *</Label>
                  <Input
                    id="street"
                    value={street}
                    onChange={(e) => { setStreet(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    value={number}
                    onChange={(e) => { setNumber(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commune">Comuna *</Label>
                  <Input
                    id="commune"
                    value={commune}
                    onChange={(e) => { setCommune(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Región *</Label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => { setRegion(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rolSii">ROL SII</Label>
                  <Input
                    id="rolSii"
                    value={rolSii}
                    onChange={(e) => { setRolSii(e.target.value); setHasUnsavedChanges(true); }}
                    placeholder="Ej: 1234-5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa *</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => { setCompany(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nombre *</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => { setContactName(e.target.value); setHasUnsavedChanges(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono (opcional)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground min-w-[45px]">{countryCode}</span>
                    <Input
                      id="phone"
                      value={phoneDigits}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setPhoneDigits(digits);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="912345678"
                      maxLength={9}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">9 dígitos máximo</p>
                </div>
              </div>
              
              {/* Multiple Emails */}
              <div className="space-y-2">
                <Label>Emails</Label>
                {emails.map((email, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const newEmails = [...emails];
                        newEmails[index] = e.target.value;
                        setEmails(newEmails);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="correo@ejemplo.com"
                    />
                    {emails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newEmails = emails.filter((_, i) => i !== index);
                          setEmails(newEmails);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmails([...emails, ""]);
                    setHasUnsavedChanges(true);
                  }}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Agregar email
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Condiciones Comerciales</CardTitle>
                  <CardDescription>
                    Modifica las condiciones de la versión actual (valores en UF)
                  </CardDescription>
                </div>
                {canReorder && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={collapseAll}
                      className="h-8 text-xs"
                    >
                      <ChevronsUpDown className="h-3 w-3 mr-1" />
                      Colapsar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={expandAll}
                      className="h-8 text-xs"
                    >
                      Expandir
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetToDefault}
                      className="h-8 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={commercialSections.map((s) => s.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {commercialSections.map((section) => {
                      const sectionContent = (() => {
                        switch (section.key) {
                          case "dates":
                            return (
                              <>
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id="hasSeparateDates"
                                    checked={hasSeparateDates}
                                    onChange={(e) => {
                                      setHasSeparateDates(e.target.checked);
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="h-4 w-4 rounded border-gray-300"
                                  />
                                  <Label htmlFor="hasSeparateDates" className="text-sm">
                                    Fecha de firma diferente a fecha de inicio
                                  </Label>
                                </div>

                                {hasSeparateDates && (
                                  <div className="space-y-2">
                                    <Label htmlFor="signedDate">Fecha de Firma</Label>
                                    <Input
                                      id="signedDate"
                                      type="date"
                                      value={signedDate}
                                      onChange={(e) => {
                                        setSignedDate(e.target.value);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <Label htmlFor="effectiveDate">
                                    {hasSeparateDates ? "Fecha de Inicio" : "Fecha Firma e Inicio"}
                                  </Label>
                                  <Input
                                    id="effectiveDate"
                                    type="date"
                                    value={effectiveDate}
                                    onChange={(e) => setEffectiveDate(e.target.value)}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {hasSeparateDates 
                                      ? "La fecha de inicio del contrato puede completarse más adelante"
                                      : "Fecha de firma e inicio del contrato"}
                                  </p>
                                </div>
                              </>
                            );
                          case "currency":
                            return (
                              <div className="space-y-2">
                                <Label>Moneda para edición</Label>
                                <Select value={currency} onValueChange={(v) => {
                                  setCurrency(v as "UF" | "CLP");
                                  setHasUnsavedChanges(true);
                                }}>
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="UF">UF</SelectItem>
                                    <SelectItem value="CLP">Pesos (CLP)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Los valores se guardan en {currency}. La conversión a {currency === "CLP" ? "UF" : "CLP"} es solo ilustrativa.
                                </p>
                              </div>
                            );
                          case "escalation":
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>¿Tiene arriendo escalonado?</Label>
                                  <RadioGroup
                                    value={hasEscalation ? "yes" : "no"}
                                    onValueChange={(value) => setHasEscalation(value === "yes")}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="no" id="no" />
                                      <Label htmlFor="no">No</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="yes" id="yes" />
                                      <Label htmlFor="yes">Sí</Label>
                                    </div>
                                  </RadioGroup>
                                </div>

                                {hasEscalation && (
                                  <>
                                    <CurrencyInput
                                      id="initialRent"
                                      label="Canon Inicial"
                                      value={initialRent}
                                      onChange={setInitialRent}
                                      currency={currency}
                                      onCurrencyChange={setCurrency}
                                      showCurrencySelector={false}
                                    />
                                    
                                    <CurrencyInput
                                      id="regimeRent"
                                      label="Canon en Régimen"
                                      value={regimeRent}
                                      onChange={setRegimeRent}
                                      currency={currency}
                                      onCurrencyChange={setCurrency}
                                      showCurrencySelector={false}
                                    />
                                    
                                    {duration && (
                                      <div className="border border-border rounded-lg p-4 mt-4">
                                        <RentEscalations
                                          escalations={escalations}
                                          onChange={setEscalations}
                                          initialRent={parseFloat(initialRent) || 0}
                                          regimeRent={parseFloat(regimeRent) || 0}
                                          durationMonths={parseInt(duration) || 12}
                                          currency={currency}
                                          graceMonths={graceMonths}
                                          onGraceMonthsChange={setGraceMonths}
                                          effectiveDate={effectiveDate}
                                          hasPeriodicAdjustments={hasPeriodicAdjustments}
                                          adjustmentType={adjustmentType}
                                          adjustmentValue={parseFloat(adjustmentValue) || 0}
                                          firstAdjustmentMonth={parseInt(firstAdjustmentMonth) || 0}
                                          adjustmentPeriodicityMonths={parseInt(adjustmentPeriodicityMonths) || 0}
                                        />
                                      </div>
                                    )}
                                  </>
                                )}

                                {!hasEscalation && (
                                  <CurrencyInput
                                    id="regimeRent"
                                    label="Canon en Régimen"
                                    value={regimeRent}
                                    onChange={setRegimeRent}
                                    currency={currency}
                                    onCurrencyChange={setCurrency}
                                    showCurrencySelector={false}
                                  />
                                )}
                              </>
                            );
                          case "variableRent":
                            return (
                              <div className="space-y-2">
                                <Label htmlFor="variableRentPercentage">Arriendo Variable (%)</Label>
                                <Input
                                  id="variableRentPercentage"
                                  type="number"
                                  step="0.01"
                                  placeholder="Ej: 5.5"
                                  value={variableRentPercentage}
                                  onChange={(e) => setVariableRentPercentage(e.target.value)}
                                />
                              </div>
                            );
                          case "guarantee":
                            return (
                              <div className="space-y-2">
                                <Label htmlFor="guaranteeMultiplier">Garantía (multiplicador del arriendo)</Label>
                                <div className="flex items-center gap-4">
                                  <Input
                                    id="guaranteeMultiplier"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    placeholder="Ej: 2"
                                    value={guaranteeMultiplier}
                                    onChange={(e) => setGuaranteeMultiplier(e.target.value)}
                                    className="w-24"
                                  />
                                  <span className="text-sm text-muted-foreground">×</span>
                                  <span className="text-sm text-muted-foreground">
                                    {regimeRent || "0"} {currency}
                                  </span>
                                  <span className="text-sm text-muted-foreground">=</span>
                                  <span className="text-sm font-medium">
                                    {guaranteeMultiplier && regimeRent
                                      ? (parseFloat(guaranteeMultiplier) * parseFloat(regimeRent)).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                      : "0"} {currency}
                                  </span>
                                </div>
                                {currency === "CLP" && ufValue > 0 && guaranteeMultiplier && regimeRent && (
                                  <p className="text-xs text-muted-foreground">
                                    ≈ {(parseFloat(guaranteeMultiplier) * convertPesosToUF(parseFloat(regimeRent))).toFixed(2)} UF
                                  </p>
                                )}
                                {currency === "UF" && ufValue > 0 && guaranteeMultiplier && regimeRent && (
                                  <p className="text-xs text-muted-foreground">
                                    ≈ ${Math.round(parseFloat(guaranteeMultiplier) * parseFloat(regimeRent) * ufValue).toLocaleString("es-CL")}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Monto de Garantía de Arriendo
                                </p>
                              </div>
                            );
                          case "gastosComunes":
                            return (
                              <div className="space-y-4">
                                {/* Metodología selector */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Metodología de Cálculo</Label>
                                  <RadioGroup
                                    value={gastosComunesMethodology}
                                    onValueChange={(value) => {
                                      setGastosComunesMethodology(value as "uf_m2" | "percentage");
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="flex flex-col gap-2"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="uf_m2" id="methodology_uf_m2" />
                                      <Label htmlFor="methodology_uf_m2" className="text-sm font-normal cursor-pointer">
                                        UF por superficie (UF/m², UF/mL, etc.)
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="percentage" id="methodology_percentage" />
                                      <Label htmlFor="methodology_percentage" className="text-sm font-normal cursor-pointer">
                                        Porcentaje del total de GGCC del centro comercial
                                      </Label>
                                    </div>
                                  </RadioGroup>
                                </div>

                                {/* Metodología UF/m2 */}
                                {gastosComunesMethodology === "uf_m2" && (
                                  <>
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id="hasExtendedGastosComunes"
                                        checked={hasExtendedGastosComunes}
                                        onChange={(e) => {
                                          setHasExtendedGastosComunes(e.target.checked);
                                          setHasUnsavedChanges(true);
                                        }}
                                        className="h-4 w-4 rounded border-gray-300"
                                      />
                                      <Label htmlFor="hasExtendedGastosComunes" className="text-sm font-medium">
                                        Ampliar metodología de cálculo
                                      </Label>
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="gastosComunesUfM2">Gastos Comunes (UF/m² de superficie)</Label>
                                      <Input
                                        id="gastosComunesUfM2"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej: 0.05"
                                        value={gastosComunesUfM2}
                                        onChange={(e) => setGastosComunesUfM2(e.target.value)}
                                      />
                                    </div>

                                    {hasExtendedGastosComunes && (
                                      <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                                        <div className="space-y-2">
                                          <Label htmlFor="gastosComunesUfMlFrente">Gastos Comunes (UF/mL de frente)</Label>
                                          <Input
                                            id="gastosComunesUfMlFrente"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Ej: 0.10"
                                            value={gastosComunesUfMlFrente}
                                            onChange={(e) => setGastosComunesUfMlFrente(e.target.value)}
                                          />
                                        </div>

                                        <div className="space-y-2">
                                          <Label htmlFor="gastosComunesProrratKwhClima">Prorrata KWH Clima (UF)</Label>
                                          <Input
                                            id="gastosComunesProrratKwhClima"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Ej: 5.00"
                                            value={gastosComunesProrratKwhClima}
                                            onChange={(e) => setGastosComunesProrratKwhClima(e.target.value)}
                                          />
                                        </div>

                                        <div className="space-y-2">
                                          <Label htmlFor="adicionalAdministracionPercentage">Adicional por Administración (%)</Label>
                                          <Input
                                            id="adicionalAdministracionPercentage"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Ej: 5"
                                            value={adicionalAdministracionPercentage}
                                            onChange={(e) => setAdicionalAdministracionPercentage(e.target.value)}
                                          />
                                          <p className="text-xs text-muted-foreground">
                                            Porcentaje sobre el Canon en Régimen (se suma a Gastos Comunes)
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {(gastosComunesUfM2 || (hasExtendedGastosComunes && (gastosComunesUfMlFrente || gastosComunesProrratKwhClima || adicionalAdministracionPercentage))) && (
                                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                                        <p className="text-sm font-medium text-primary">Total Gastos Comunes Estimado:</p>
                                        {(() => {
                                          const gastosM2 = (parseFloat(gastosComunesUfM2) || 0) * superficieEdificadaLocal;
                                          const gastosMlFrente = hasExtendedGastosComunes ? (parseFloat(gastosComunesUfMlFrente) || 0) * metrosLinealesFrente : 0;
                                          const gastosKwhClima = hasExtendedGastosComunes ? (parseFloat(gastosComunesProrratKwhClima) || 0) : 0;
                                          const adicionalAdmin = hasExtendedGastosComunes ? (parseFloat(regimeRent) || 0) * ((parseFloat(adicionalAdministracionPercentage) || 0) / 100) : 0;
                                          const totalUF = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin;
                                          const totalCLP = totalUF * (ufValue || 0);
                                          
                                          return (
                                            <div className="space-y-1">
                                              <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Total:</span>
                                                <span className="font-semibold">{totalUF.toFixed(2)} UF</span>
                                              </div>
                                              {ufValue > 0 && (
                                                <div className="flex justify-between text-sm">
                                                  <span className="text-muted-foreground">Equivalente:</span>
                                                  <span className="font-medium">${Math.round(totalCLP).toLocaleString("es-CL")}</span>
                                                </div>
                                              )}
                                              <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
                                                {gastosM2 > 0 && <div>UF/m² × {superficieEdificadaLocal}m² = {gastosM2.toFixed(2)} UF</div>}
                                                {gastosMlFrente > 0 && <div>UF/mL × {metrosLinealesFrente}mL = {gastosMlFrente.toFixed(2)} UF</div>}
                                                {gastosKwhClima > 0 && <div>Prorrata KWH Clima = {gastosKwhClima.toFixed(2)} UF</div>}
                                                {adicionalAdmin > 0 && <div>Adic. Admin ({adicionalAdministracionPercentage}%) = {adicionalAdmin.toFixed(2)} UF</div>}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Metodología Porcentaje */}
                                {gastosComunesMethodology === "percentage" && (
                                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                                    <div className="space-y-2">
                                      <Label htmlFor="gastosComunesTotalCentro">Total GGCC del Centro Comercial (UF/mes)</Label>
                                      <Input
                                        id="gastosComunesTotalCentro"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej: 10000"
                                        value={gastosComunesTotalCentro}
                                        onChange={(e) => {
                                          setGastosComunesTotalCentro(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Monto total de gastos comunes del centro comercial
                                      </p>
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="gastosComunesPercentage">Porcentaje de Participación (%)</Label>
                                      <Input
                                        id="gastosComunesPercentage"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        placeholder="Ej: 2.5"
                                        value={gastosComunesPercentage}
                                        onChange={(e) => {
                                          setGastosComunesPercentage(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Porcentaje del total de GGCC que corresponde al local
                                      </p>
                                    </div>

                                    <div className="space-y-3">
                                      <Label className="text-sm font-medium">Tope Máximo (opcional)</Label>
                                      <RadioGroup
                                        value={gastosComunesTopeType}
                                        onValueChange={(value) => {
                                          setGastosComunesTopeType(value as "fixed" | "uf_m2");
                                          setHasUnsavedChanges(true);
                                        }}
                                        className="flex flex-col gap-2"
                                      >
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="fixed" id="tope_fixed" />
                                          <Label htmlFor="tope_fixed" className="text-sm font-normal cursor-pointer">
                                            Monto fijo (UF/mes)
                                          </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="uf_m2" id="tope_uf_m2" />
                                          <Label htmlFor="tope_uf_m2" className="text-sm font-normal cursor-pointer">
                                            Por superficie (UF/m²)
                                          </Label>
                                        </div>
                                      </RadioGroup>
                                      <Input
                                        id="gastosComunesTope"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder={gastosComunesTopeType === "fixed" ? "Ej: 150 UF/mes" : "Ej: 0.15 UF/m²"}
                                        value={gastosComunesTope}
                                        onChange={(e) => {
                                          setGastosComunesTope(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        {gastosComunesTopeType === "fixed" 
                                          ? "Monto máximo a pagar por concepto de GGCC" 
                                          : "Monto máximo por m² de superficie edificada"}
                                      </p>
                                    </div>

                                    {(gastosComunesTotalCentro && gastosComunesPercentage) && (
                                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                                        <p className="text-sm font-medium text-primary">Total Gastos Comunes Estimado:</p>
                                        {(() => {
                                          const totalCentro = parseFloat(gastosComunesTotalCentro) || 0;
                                          const percentage = parseFloat(gastosComunesPercentage) || 0;
                                          const topeValue = parseFloat(gastosComunesTope) || 0;
                                          const superficie = parseFloat(String(superficieEdificadaLocal)) || 0;
                                          
                                          // Calculate effective cap based on type
                                          const effectiveTope = gastosComunesTopeType === "uf_m2" && superficie > 0
                                            ? topeValue * superficie
                                            : topeValue;
                                          
                                          const calculatedAmount = (totalCentro * percentage) / 100;
                                          const hasValidTope = topeValue > 0 && (gastosComunesTopeType === "fixed" || superficie > 0);
                                          const finalAmount = hasValidTope ? Math.min(calculatedAmount, effectiveTope) : calculatedAmount;
                                          const isTopApplied = hasValidTope && calculatedAmount > effectiveTope;
                                          const totalCLP = finalAmount * (ufValue || 0);
                                          
                                          return (
                                            <div className="space-y-1">
                                              <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Cálculo:</span>
                                                <span className="font-medium">{calculatedAmount.toFixed(2)} UF</span>
                                              </div>
                                              {isTopApplied && (
                                                <div className="flex justify-between text-sm text-amber-600">
                                                  <span>Tope aplicado:</span>
                                                  <span className="font-medium">-{(calculatedAmount - effectiveTope).toFixed(2)} UF</span>
                                                </div>
                                              )}
                                              <div className="flex justify-between text-sm border-t pt-1 mt-1">
                                                <span className="text-muted-foreground font-medium">Total:</span>
                                                <span className="font-semibold">{finalAmount.toFixed(2)} UF</span>
                                              </div>
                                              {ufValue > 0 && (
                                                <div className="flex justify-between text-sm">
                                                  <span className="text-muted-foreground">Equivalente:</span>
                                                  <span className="font-medium">${Math.round(totalCLP).toLocaleString("es-CL")}</span>
                                                </div>
                                              )}
                                              <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
                                                <div>{totalCentro.toLocaleString("es-CL")} UF × {percentage}% = {calculatedAmount.toFixed(2)} UF</div>
                                                {isTopApplied && (
                                                  <div className="text-amber-600">
                                                    Tope máximo: {gastosComunesTopeType === "uf_m2" 
                                                      ? `${superficie.toFixed(0)} m² × ${topeValue} UF/m² = ${effectiveTope.toFixed(2)} UF`
                                                      : `${effectiveTope.toFixed(2)} UF`}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          case "fondoPromocion":
                            return (
                              <div className="space-y-2">
                                <Label htmlFor="fondoPromocionPercentage">Fondo de Promoción (%)</Label>
                                <Input
                                  id="fondoPromocionPercentage"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Ej: 2.5"
                                  value={fondoPromocionPercentage}
                                  onChange={(e) => setFondoPromocionPercentage(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Porcentaje sobre el Canon en Régimen (puede ser 0)
                                </p>
                              </div>
                            );
                          case "otrosArrendamientos":
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor="otrosEgresosAmount">Otros Arrendamientos ({currency})</Label>
                                  {otrosEgresosDescription && (
                                    <span className="text-xs text-muted-foreground">Nota: {otrosEgresosDescription}</span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    id="otrosEgresosAmount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Monto"
                                    value={otrosEgresosAmount}
                                    onChange={(e) => {
                                      setOtrosEgresosAmount(e.target.value);
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="flex-1"
                                  />
                                  <Input
                                    id="otrosEgresosDescription"
                                    type="text"
                                    placeholder="Nota (opcional)"
                                    value={otrosEgresosDescription}
                                    onChange={(e) => {
                                      setOtrosEgresosDescription(e.target.value);
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="flex-1"
                                  />
                                </div>
                              </div>
                            );
                          case "periodicAdjustments":
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>¿Tiene reajustes periódicos?</Label>
                                  <RadioGroup
                                    value={hasPeriodicAdjustments ? "yes" : "no"}
                                    onValueChange={(value) => setHasPeriodicAdjustments(value === "yes")}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="no" id="periodicNo" />
                                      <Label htmlFor="periodicNo">No</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="yes" id="periodicYes" />
                                      <Label htmlFor="periodicYes">Sí</Label>
                                    </div>
                                  </RadioGroup>
                                </div>

                                {hasPeriodicAdjustments && (
                                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                                    <div className="space-y-2">
                                      <Label>Tipo de reajuste</Label>
                                      <RadioGroup
                                        value={adjustmentType}
                                        onValueChange={(value: "percentage" | "fixed") => {
                                          setAdjustmentType(value);
                                          setHasUnsavedChanges(true);
                                        }}
                                        className="flex gap-4"
                                      >
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="percentage" id="adjPercentage" />
                                          <Label htmlFor="adjPercentage">Porcentaje (%)</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="fixed" id="adjFixed" />
                                          <Label htmlFor="adjFixed">Monto fijo ({currency})</Label>
                                        </div>
                                      </RadioGroup>
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="adjustmentValue">
                                        {adjustmentType === "percentage" ? "Porcentaje de reajuste (%)" : `Monto de reajuste (${currency})`}
                                      </Label>
                                      <Input
                                        id="adjustmentValue"
                                        type="number"
                                        step={adjustmentType === "percentage" ? "0.1" : "0.01"}
                                        min="0"
                                        placeholder={adjustmentType === "percentage" ? "Ej: 10" : "Ej: 5.5"}
                                        value={adjustmentValue}
                                        onChange={(e) => {
                                          setAdjustmentValue(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="firstAdjustmentMonth">Mes del primer reajuste</Label>
                                      <Input
                                        id="firstAdjustmentMonth"
                                        type="number"
                                        min="1"
                                        placeholder="Ej: 60"
                                        value={firstAdjustmentMonth}
                                        onChange={(e) => {
                                          setFirstAdjustmentMonth(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <Label htmlFor="adjustmentPeriodicityMonths">Periodicidad (meses)</Label>
                                      <Input
                                        id="adjustmentPeriodicityMonths"
                                        type="number"
                                        min="1"
                                        placeholder="Ej: 60"
                                        value={adjustmentPeriodicityMonths}
                                        onChange={(e) => {
                                          setAdjustmentPeriodicityMonths(e.target.value);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </div>

                                    {adjustmentValue && regimeRent && firstAdjustmentMonth && adjustmentPeriodicityMonths && (
                                      <div className="bg-background/50 rounded p-3 space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Vista previa de reajustes:</p>
                                        <div className="text-xs space-y-1">
                                          {(() => {
                                            const baseRent = parseFloat(regimeRent);
                                            const adjValue = parseFloat(adjustmentValue);
                                            const firstMonth = parseInt(firstAdjustmentMonth);
                                            const periodicity = parseInt(adjustmentPeriodicityMonths);
                                            const durationMonths = parseInt(duration) || 120;
                                            const adjustments: { month: number; rent: number }[] = [];
                                            
                                            let currentRent = baseRent;
                                            let month = firstMonth;
                                            
                                            while (month <= durationMonths && adjustments.length < 5) {
                                              if (adjustmentType === "percentage") {
                                                currentRent = currentRent * (1 + adjValue / 100);
                                              } else {
                                                currentRent = currentRent + adjValue;
                                              }
                                              adjustments.push({ month, rent: currentRent });
                                              month += periodicity;
                                            }
                                            
                                            return adjustments.map((adj, idx) => (
                                              <div key={idx} className="flex justify-between">
                                                <span>Mes {adj.month}:</span>
                                                <span className="font-medium">{adj.rent.toFixed(2)} UF</span>
                                              </div>
                                            ));
                                          })()}
                                          <p className="text-muted-foreground mt-2 italic">
                                            {adjustmentType === "percentage" 
                                              ? "Los reajustes se aplican sobre la renta ya reajustada (compuesto)"
                                              : "Los reajustes se suman a la renta acumulada"}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          case "duration":
                            return (
                              <div className="space-y-2">
                                <Label htmlFor="duration">Duración (meses) *</Label>
                                <Input
                                  id="duration"
                                  type="number"
                                  value={duration}
                                  onChange={(e) => setDuration(e.target.value)}
                                />
                              </div>
                            );
                          case "noticeType":
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>Tipo de Aviso de Término *</Label>
                                  <Select value={noticeType} onValueChange={(value: any) => {
                                    setNoticeType(value);
                                    setHasUnsavedChanges(true);
                                  }}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="meses">Meses antes del vencimiento</SelectItem>
                                      <SelectItem value="fecha">Fecha específica</SelectItem>
                                      <SelectItem value="rangos">Rangos de meses</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Tipo de Aviso</Label>
                                  <RadioGroup
                                    value={noticeBilaterality}
                                    onValueChange={(value: "unilateral_gp" | "bilateral") => {
                                      setNoticeBilaterality(value);
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="flex gap-4"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="unilateral_gp" id="unilateralGp" />
                                      <Label htmlFor="unilateralGp">Unilateral GP</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="bilateral" id="bilateral" />
                                      <Label htmlFor="bilateral">Bilateral</Label>
                                    </div>
                                  </RadioGroup>
                                  <p className="text-xs text-muted-foreground">
                                    Bilateral: el propietario también puede dar aviso de término
                                  </p>
                                </div>

                                {noticeType === "meses" && (
                                  <div className="space-y-2">
                                    <Label htmlFor="noticeValue">Número de Meses *</Label>
                                    <Input
                                      id="noticeValue"
                                      type="number"
                                      min="1"
                                      value={noticeValue}
                                      onChange={(e) => {
                                        setNoticeValue(e.target.value);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </div>
                                )}

                                {noticeType === "fecha" && (
                                  <div className="space-y-2">
                                    <Label htmlFor="noticeValue">Fecha *</Label>
                                    <Input
                                      id="noticeValue"
                                      type="date"
                                      value={noticeValue}
                                      onChange={(e) => {
                                        setNoticeValue(e.target.value);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </div>
                                )}

                                {noticeType === "rangos" && (
                                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                                    <div className="flex items-center justify-between">
                                      <Label>Rangos de Aviso (meses dentro de la vigencia)</Label>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const maxMonth = parseInt(duration) || 12;
                                          setNoticeRanges([...noticeRanges, { start_month: 1, end_month: Math.min(3, maxMonth) }]);
                                          setHasUnsavedChanges(true);
                                        }}
                                        className="gap-1"
                                      >
                                        <Plus className="h-4 w-4" />
                                        Agregar rango
                                      </Button>
                                    </div>
                                    
                                    {noticeRanges.length === 0 && (
                                      <p className="text-sm text-muted-foreground">
                                        No hay rangos definidos. Agrega uno o más rangos de meses.
                                      </p>
                                    )}

                                    {noticeRanges.map((range, index) => (
                                      <div key={index} className="flex items-center gap-3 p-3 bg-background rounded-md border">
                                        <span className="text-sm font-medium">Rango {index + 1}:</span>
                                        <div className="flex items-center gap-2">
                                          <Label className="text-sm">Del mes</Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            max={parseInt(duration) || 999}
                                            value={range.start_month}
                                            onChange={(e) => {
                                              const newRanges = [...noticeRanges];
                                              newRanges[index].start_month = parseInt(e.target.value) || 1;
                                              setNoticeRanges(newRanges);
                                              setHasUnsavedChanges(true);
                                            }}
                                            className="w-20"
                                          />
                                          <Label className="text-sm">al mes</Label>
                                          <Input
                                            type="number"
                                            min={range.start_month}
                                            max={parseInt(duration) || 999}
                                            value={range.end_month}
                                            onChange={(e) => {
                                              const newRanges = [...noticeRanges];
                                              newRanges[index].end_month = parseInt(e.target.value) || range.start_month;
                                              setNoticeRanges(newRanges);
                                              setHasUnsavedChanges(true);
                                            }}
                                            className="w-20"
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newRanges = noticeRanges.filter((_, i) => i !== index);
                                            setNoticeRanges(newRanges);
                                            setHasUnsavedChanges(true);
                                          }}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}

                                    {duration && noticeRanges.length > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        La duración del contrato es de {duration} meses. Los rangos deben estar dentro de este período.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          default:
                            return null;
                        }
                      })();

                      return (
                        <EditableSectionWrapper
                          key={section.key}
                          id={section.key}
                          title={sectionTitles[section.key]}
                          isCollapsed={isCollapsed(section.key)}
                          onToggleCollapse={() => toggleCollapsed(section.key)}
                          isDraggable={canReorder}
                        >
                          {sectionContent}
                        </EditableSectionWrapper>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate(`/contracts/${id}`)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default EditContract;
