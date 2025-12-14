import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, FileSearch, CheckCircle2, AlertCircle, FileText, MapPin, Users } from "lucide-react";

interface ExtractedField {
  field: string;
  label: string;
  value: string;
  confidence: 'alta' | 'media';
  category: 'contractual' | 'ubicacion' | 'partes';
}

interface ContractDataImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  documentContent?: string;
  onImportComplete: () => void;
}

export function ContractDataImportModal({
  open,
  onOpenChange,
  contractId,
  contractName,
  documentContent,
  onImportComplete,
}: ContractDataImportModalProps) {
  const [step, setStep] = useState<'initial' | 'loading' | 'preview' | 'nodata'>('initial');
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('initial');
      setExtractedFields([]);
      setSelectedFields(new Set());
    }
  }, [open]);

  const handleReviewData = async () => {
    setStep('loading');

    try {
      // If documentContent looks like a URL, pass it as documentUrl
      const isUrl = documentContent?.startsWith('http');
      
      const { data, error } = await supabase.functions.invoke('extract-contract-data', {
        body: isUrl 
          ? { documentUrl: documentContent }
          : { documentContent }
      });

      if (error) throw error;

      if (!data.success || !data.fields || data.fields.length === 0) {
        setStep('nodata');
        return;
      }

      setExtractedFields(data.fields);
      
      // Pre-select high confidence fields
      const highConfidenceFields = new Set<string>(
        data.fields
          .filter((f: ExtractedField) => f.confidence === 'alta')
          .map((f: ExtractedField) => f.field)
      );
      setSelectedFields(highConfidenceFields);
      
      setStep('preview');
    } catch (error: any) {
      console.error('Error extracting data:', error);
      toast.error('Error al analizar el contrato', {
        description: error.message || 'No se pudo procesar el documento'
      });
      onOpenChange(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
    onImportComplete();
  };

  const toggleField = (field: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(field)) {
      newSelected.delete(field);
    } else {
      newSelected.add(field);
    }
    setSelectedFields(newSelected);
  };

  const handleConfirmImport = async () => {
    if (selectedFields.size === 0) {
      toast.info('No hay campos seleccionados para importar');
      return;
    }

    setImporting(true);

    try {
      const fieldsToImport = extractedFields.filter(f => selectedFields.has(f.field));
      
      // Map fields to database updates
      const contractUpdates: Record<string, any> = {};
      const versionUpdates: Record<string, any> = {};
      const addressData: Record<string, any> = {};
      const contactData: Record<string, any> = {};

      for (const field of fieldsToImport) {
        switch (field.field) {
          case 'nombre_contrato':
            contractUpdates.name = field.value;
            break;
          case 'duracion_meses':
            versionUpdates.duration_months = parseInt(field.value) || null;
            break;
          case 'canon_arriendo':
            versionUpdates.regime_rent = parseFloat(field.value.replace(/[^\d.,]/g, '').replace(',', '.')) || null;
            break;
          case 'arriendo_variable_porcentaje':
            versionUpdates.variable_rent_percentage = parseFloat(field.value) || null;
            break;
          case 'meses_aviso_termino':
            versionUpdates.notice_type = 'meses';
            versionUpdates.notice_value = field.value;
            break;
          case 'garantia':
            const garantiaMeses = parseInt(field.value);
            if (!isNaN(garantiaMeses)) {
              versionUpdates.guarantee_multiplier = garantiaMeses;
            }
            break;
          case 'direccion':
            addressData.street = field.value;
            break;
          case 'comuna':
            addressData.commune = field.value;
            break;
          case 'region':
            addressData.region = field.value;
            break;
          case 'pais':
            addressData.country = field.value;
            break;
          case 'empresa':
            contactData.company = field.value;
            break;
          case 'representante_nombre':
            contactData.name = field.value;
            break;
          case 'representante_telefono':
            contactData.phone = field.value;
            break;
          case 'representante_email':
            contactData.email = field.value;
            break;
        }
      }

      // Apply updates only to empty fields
      if (Object.keys(contractUpdates).length > 0) {
        // Get current contract to check for empty fields
        const { data: currentContract } = await supabase
          .from('contracts')
          .select('name')
          .eq('id', contractId)
          .single();

        const filteredUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(contractUpdates)) {
          if (!currentContract?.[key as keyof typeof currentContract]) {
            filteredUpdates[key] = value;
          }
        }

        if (Object.keys(filteredUpdates).length > 0) {
          await supabase
            .from('contracts')
            .update(filteredUpdates)
            .eq('id', contractId);
        }
      }

      // Update version if needed
      if (Object.keys(versionUpdates).length > 0) {
        const { data: currentVersion } = await supabase
          .from('contract_versions')
          .select('*')
          .eq('contract_id', contractId)
          .eq('is_current', true)
          .single();

        if (currentVersion) {
          const filteredVersionUpdates: Record<string, any> = {};
          for (const [key, value] of Object.entries(versionUpdates)) {
            const currentValue = currentVersion[key as keyof typeof currentVersion];
            if (currentValue === null || currentValue === undefined || currentValue === 0) {
              filteredVersionUpdates[key] = value;
            }
          }

          if (Object.keys(filteredVersionUpdates).length > 0) {
            await supabase
              .from('contract_versions')
              .update(filteredVersionUpdates)
              .eq('id', currentVersion.id);
          }
        }
      }

      // Update or create address if needed
      if (Object.keys(addressData).length > 0) {
        const { data: existingAddress } = await supabase
          .from('contract_addresses')
          .select('*')
          .eq('contract_id', contractId)
          .maybeSingle();

        if (existingAddress) {
          const filteredAddressUpdates: Record<string, any> = {};
          for (const [key, value] of Object.entries(addressData)) {
            const currentValue = existingAddress[key as keyof typeof existingAddress];
            if (!currentValue || currentValue === '') {
              filteredAddressUpdates[key] = value;
            }
          }

          if (Object.keys(filteredAddressUpdates).length > 0) {
            await supabase
              .from('contract_addresses')
              .update(filteredAddressUpdates)
              .eq('id', existingAddress.id);
          }
        } else if (addressData.street || addressData.commune) {
          await supabase
            .from('contract_addresses')
            .insert({
              contract_id: contractId,
              street: addressData.street || '',
              number: '',
              commune: addressData.commune || '',
              region: addressData.region || '',
              country: addressData.country || 'Chile',
            });
        }
      }

      // Update or create contact if needed
      if (Object.keys(contactData).length > 0) {
        const { data: existingContact } = await supabase
          .from('contract_contacts')
          .select('*')
          .eq('contract_id', contractId)
          .maybeSingle();

        if (existingContact) {
          const filteredContactUpdates: Record<string, any> = {};
          for (const [key, value] of Object.entries(contactData)) {
            const currentValue = existingContact[key as keyof typeof existingContact];
            if (!currentValue || currentValue === '') {
              filteredContactUpdates[key] = value;
            }
          }

          if (Object.keys(filteredContactUpdates).length > 0) {
            await supabase
              .from('contract_contacts')
              .update(filteredContactUpdates)
              .eq('id', existingContact.id);
          }
        } else if (contactData.company || contactData.name) {
          await supabase
            .from('contract_contacts')
            .insert({
              contract_id: contractId,
              company: contactData.company || '',
              name: contactData.name || '',
              phone: contactData.phone || '',
              email: contactData.email || '',
            });
        }
      }

      toast.success('Datos importados exitosamente', {
        description: `Se importaron ${selectedFields.size} campos al contrato`
      });

      onOpenChange(false);
      onImportComplete();
    } catch (error: any) {
      console.error('Error importing data:', error);
      toast.error('Error al importar datos', {
        description: error.message
      });
    } finally {
      setImporting(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'contractual':
        return <FileText className="h-4 w-4" />;
      case 'ubicacion':
        return <MapPin className="h-4 w-4" />;
      case 'partes':
        return <Users className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'contractual':
        return 'Datos Contractuales';
      case 'ubicacion':
        return 'Ubicación';
      case 'partes':
        return 'Partes del Contrato';
      default:
        return category;
    }
  };

  const groupedFields = extractedFields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, ExtractedField[]>);

  return (
    <>
      {/* Initial prompt dialog */}
      <AlertDialog open={open && step === 'initial'} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-primary" />
              Importar datos del contrato
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas revisar e importar automáticamente los datos detectados en el contrato para completar la información?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkip}>
              No, continuar sin importar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleReviewData}>
              Sí, revisar datos detectados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading dialog */}
      <AlertDialog open={open && step === 'loading'} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Analizando contrato...
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estamos extrayendo los datos del documento "{contractName}". Esto puede tomar unos segundos.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* No data found dialog */}
      <AlertDialog open={open && step === 'nodata'} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Sin datos detectados
            </AlertDialogTitle>
            <AlertDialogDescription>
              No se detectaron datos suficientes para importar desde el contrato. El contrato se mantendrá en estado Firmado sin modificaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleSkip}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview dialog */}
      <AlertDialog open={open && step === 'preview'} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Datos detectados en el contrato
            </AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona los datos que deseas importar al contrato. Solo se completarán campos actualmente vacíos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-6">
              {Object.entries(groupedFields).map(([category, fields]) => (
                <div key={category} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    {getCategoryIcon(category)}
                    {getCategoryLabel(category)}
                  </div>
                  <div className="space-y-2 pl-6">
                    {fields.map((field) => (
                      <div
                        key={field.field}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={field.field}
                          checked={selectedFields.has(field.field)}
                          onCheckedChange={() => toggleField(field.field)}
                        />
                        <label
                          htmlFor={field.field}
                          className="flex-1 flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{field.label}:</span>
                            <span className="text-sm text-foreground">{field.value}</span>
                          </div>
                          <Badge
                            variant={field.confidence === 'alta' ? 'default' : 'secondary'}
                            className={field.confidence === 'alta' ? 'bg-green-500' : 'bg-amber-500'}
                          >
                            {field.confidence === 'alta' ? 'Alta' : 'Media'}
                          </Badge>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="text-sm text-muted-foreground mt-4">
            {selectedFields.size} de {extractedFields.length} campos seleccionados
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancelar</AlertDialogCancel>
            <Button onClick={handleConfirmImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar importación
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
