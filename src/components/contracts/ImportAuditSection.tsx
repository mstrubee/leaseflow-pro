import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, MapPin, Users, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ImportAuditRecord {
  id: string;
  field_name: string;
  field_label: string;
  imported_value: string;
  confidence: string;
  category: string;
  imported_at: string;
}

interface ImportAuditSectionProps {
  contractId: string;
}

export function ImportAuditSection({ contractId }: ImportAuditSectionProps) {
  const [auditRecords, setAuditRecords] = useState<ImportAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadAuditRecords();
  }, [contractId]);

  const loadAuditRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_import_audit')
        .select('*')
        .eq('contract_id', contractId)
        .order('imported_at', { ascending: false });

      if (error) throw error;
      setAuditRecords(data || []);
    } catch (error) {
      console.error('Error loading audit records:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'contractual':
        return <FileText className="h-3 w-3" />;
      case 'ubicacion':
        return <MapPin className="h-3 w-3" />;
      case 'partes':
        return <Users className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'contractual':
        return 'Contractual';
      case 'ubicacion':
        return 'Ubicación';
      case 'partes':
        return 'Partes';
      default:
        return category;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading || auditRecords.length === 0) {
    return null;
  }

  // Group by import date (same import session)
  const groupedByDate = auditRecords.reduce((acc, record) => {
    const dateKey = new Date(record.imported_at).toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, ImportAuditRecord[]>);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Datos importados por IA
                <Badge variant="secondary" className="ml-2">
                  {auditRecords.length} campos
                </Badge>
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>
            Campos extraídos automáticamente del documento del contrato
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {Object.entries(groupedByDate).map(([date, records]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    Importado el {formatDate(records[0].imported_at)}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {records.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-background border text-sm"
                      >
                        <span className="text-muted-foreground">
                          {getCategoryIcon(record.category)}
                        </span>
                        <span className="font-medium">{record.field_label}:</span>
                        <span className="text-foreground truncate flex-1">
                          {record.imported_value}
                        </span>
                        <Badge
                          variant="outline"
                          className={record.confidence === 'alta' 
                            ? 'border-green-500 text-green-600 text-xs' 
                            : 'border-amber-500 text-amber-600 text-xs'
                          }
                        >
                          {record.confidence}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
